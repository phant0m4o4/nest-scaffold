import { ICursorKeysetItem } from '@/common/modules/database/common/repositories/interfaces/cursor-keyset.interface';
import { buildCursorScope } from '@/common/modules/database/mysql/repositories/utils/cursor/build-cursor-scope';
import {
  decodeCursor,
  encodeCursor,
} from '@/common/modules/database/mysql/repositories/utils/cursor/encode-cursor';
import {
  isSameOrderDeclaration,
  parseOrderQuery,
} from '@/common/modules/database/mysql/repositories/utils/cursor/parse-order';
import { decodePublicId, generatePublicId } from '@/common/utils/public-id';
import { DemoRepository } from '@/app/repositories/demo.repository';
import { RecordNotFoundException } from '@/common/modules/database/common/repositories/exceptions/record-not-found-exception';
import type { AppConfigType } from '@/configs/app.config';
import appConfig from '@/configs/app.config';
import { demosSchema } from '@/database/mysql/schemas/demos.schema';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, gte, like, lte, SQL } from 'drizzle-orm';
import { hkdfSync } from 'node:crypto';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import {
  DEMO_CURSOR_ORDERABLE_COLUMNS,
  FindManyDemoByCursoredPaginationRequestDto,
  FindManyDemoByPaginationRequestDto,
} from './dtos/find-many-demo-request.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';

/** Demo 列表 resourceKey（写入 cursor.scope，防用户/管理互串） */
export const DEMO_LIST_RESOURCE_KEY = 'demo.list';
export const ADMIN_DEMO_LIST_RESOURCE_KEY = 'admin.demo.list';

/** 同一发号范围固定 tweak，以保持稳定的 id/code 映射。 */
const DEMO_CODE_TWEAK = 'demos/code';

/**
 * Demo 过滤条件接口
 */
interface IDemoFilterOptions {
  name?: string;
  type?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  updatedAtFrom?: Date;
  updatedAtTo?: Date;
}

@Injectable()
export class DemoService {
  private readonly _codeSecretKey: Buffer;

  constructor(
    protected readonly demoRepository: DemoRepository,
    @Inject(appConfig.KEY) private readonly _appConfig: AppConfigType,
  ) {
    // 初始化时派生 FF1 专用密钥，与分页游标密钥分离；主密钥和用途标签须保持稳定。
    this._codeSecretKey = Buffer.from(
      hkdfSync(
        'sha256',
        _appConfig.masterKey,
        Buffer.alloc(0),
        'nest-scaffold/demo-code/ff1/v1',
        32,
      ),
    );
  }

  /**
   * 创建 Demo（仓储 create 自动分配长码 publicId + 短码 shortPublicId）
   * @returns 内部 id、两类随机公开标识及由 id 计算的 code
   */
  async create(body: CreateDemoRequestDto): Promise<{
    id: number;
    publicId: string;
    shortPublicId: string;
    code: string;
  }> {
    const row = await this.demoRepository.create({ data: body });
    return this._withCode(row);
  }

  /**
   * 查询全部 Demo（无分页）
   */
  async findAll() {
    const rows = await this.demoRepository.findAll({});
    return rows.map((row) => this._withCode(row));
  }

  /**
   * 加密游标分页（用户端与管理端共用；仅 resourceKey 不同）
   */
  async findManyByCursorPagination(
    query: FindManyDemoByCursoredPaginationRequestDto,
    resourceKey: string,
  ) {
    const { cursor, limit, order: orderRaw, ...filterOptions } = query;
    const order = parseOrderQuery(orderRaw, DEMO_CURSOR_ORDERABLE_COLUMNS);
    const scope = buildCursorScope(resourceKey, filterOptions);

    let keyset: ICursorKeysetItem[] | undefined;
    if (cursor) {
      const payload = decodeCursor(cursor, this._appConfig.masterKey);
      if (payload.scope !== scope) {
        throw new BadRequestException('无效的分页游标');
      }
      if (!isSameOrderDeclaration(order, payload.order)) {
        throw new BadRequestException('分页游标与当前排序不一致');
      }
      keyset = payload.order;
    }

    const filters = this._buildFilters(filterOptions);
    const result = await this.demoRepository.findManyWithCursorPagination({
      limit: limit ?? 30,
      cursor: keyset,
      order,
      filter: filters,
    });

    return {
      data: result.data.map((row) => this._withCode(row)),
      meta: {
        nextCursor: result.meta.nextCursor
          ? encodeCursor(
              { scope, order: result.meta.nextCursor },
              this._appConfig.masterKey,
            )
          : null,
      },
    };
  }

  /**
   * 普通分页查询 Demo，支持多条件过滤
   */
  async findManyByPagination(query: FindManyDemoByPaginationRequestDto) {
    const { page, pageSize, orderColumn, orderDirection, ...filterOptions } =
      query;
    const filters = this._buildFilters(filterOptions);
    const result = await this.demoRepository.findManyWithPagination({
      page: page ?? 1,
      pageSize: pageSize ?? 30,
      filter: filters,
      order: {
        column: orderColumn ?? 'id',
        direction: orderDirection ?? 'desc',
      },
    });
    return { ...result, data: result.data.map((row) => this._withCode(row)) };
  }

  /**
   * 构建过滤条件 SQL 数组
   */
  private _buildFilters(options: IDemoFilterOptions): SQL[] {
    const filters: SQL[] = [];
    if (options.name) {
      filters.push(like(demosSchema.name, `%${options.name}%`));
    }
    if (options.type) {
      filters.push(eq(demosSchema.type, options.type));
    }
    if (options.createdAtFrom) {
      filters.push(gte(demosSchema.createdAt, options.createdAtFrom));
    }
    if (options.createdAtTo) {
      filters.push(lte(demosSchema.createdAt, options.createdAtTo));
    }
    if (options.updatedAtFrom) {
      filters.push(gte(demosSchema.updatedAt, options.updatedAtFrom));
    }
    if (options.updatedAtTo) {
      filters.push(lte(demosSchema.updatedAt, options.updatedAtTo));
    }
    return filters;
  }

  /**
   * 按内部主键查询（admin）
   */
  async findOne(id: number) {
    const row = await this.demoRepository.findOne({ id });
    return row ? this._withCode(row) : null;
  }

  /**
   * 按公开标识查询（用户端）
   */
  async findOneByPublicId(publicId: string) {
    const row = await this.demoRepository.findOneByPublicId({ publicId });
    return row ? this._withCode(row) : null;
  }

  /**
   * 按 FF1 数字编码查询，解码后复用内部主键查询。
   * @throws {BadRequestException} 编码格式无效或还原的 id 超出安全整数范围。
   */
  async findOneByCode(code: string) {
    return this.findOne(this._codeToId(code));
  }

  /**
   * 按内部主键更新（admin）
   */
  async update(id: number, body: UpdateDemoRequestDto) {
    if (body.parentId === id) {
      throw new BadRequestException('不能将自身设为父级');
    }
    return await this.demoRepository.update({ id, data: body });
  }

  /**
   * 按公开标识更新（用户端）：先解析出内部 id 再更新
   */
  async updateByPublicId(publicId: string, body: UpdateDemoRequestDto) {
    const row = await this.demoRepository.findOneByPublicId({ publicId });
    if (!row) {
      throw new RecordNotFoundException();
    }
    return await this.update(row.id, body);
  }

  /**
   * 按内部主键删除（admin）
   */
  async delete(id: number) {
    return await this.demoRepository.delete({ id });
  }

  /**
   * 按公开标识删除（用户端）
   */
  async deleteByPublicId(publicId: string) {
    const row = await this.demoRepository.findOneByPublicId({ publicId });
    if (!row) {
      throw new RecordNotFoundException();
    }
    return await this.demoRepository.delete({ id: row.id });
  }

  /** 为返回数据补充由主键生成的 code。 */
  private _withCode<T extends { id: number }>(row: T): T & { code: string } {
    return { ...row, code: this._idToCode(row.id) };
  }

  /** 将内部主键编码为数字字符串，位数向上取偶数、最少 6 位，保留前导零。 */
  private _idToCode(id: number): string {
    return generatePublicId(this._getCodeSize(id), 'ff1', {
      sequence: id,
      secretKey: this._codeSecretKey,
      tweak: DEMO_CODE_TWEAK,
    });
  }

  /** 将 code 还原为内部主键，在转换为 number 前校验精度和主键范围。 */
  private _codeToId(code: string): number {
    if (
      typeof code !== 'string' ||
      code.length < 6 ||
      code.length > 16 ||
      code.length % 2 !== 0
    ) {
      throw new BadRequestException('无效的 Demo 编码');
    }

    let id: bigint;
    try {
      id = decodePublicId(code, {
        secretKey: this._codeSecretKey,
        size: code.length,
        tweak: DEMO_CODE_TWEAK,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException('无效的 Demo 编码');
      }
      throw error;
    }

    if (
      id < 1n ||
      id > BigInt(Number.MAX_SAFE_INTEGER) ||
      code.length !== this._getCodeSize(id)
    ) {
      throw new BadRequestException('无效的 Demo 编码');
    }
    return Number(id);
  }

  /** 1～6 位使用 6 位，7～8 位使用 8 位，9～10 位使用 10 位，依此类推。 */
  private _getCodeSize(id: number | bigint): number {
    return Math.max(6, Math.ceil(id.toString().length / 2) * 2);
  }
}
