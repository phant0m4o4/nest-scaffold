import { ICursorKeysetItem } from '@/app/repositories/common/interfaces/cursor-keyset.interface';
import { buildCursorScope } from '@/app/repositories/common/mysql/utils/cursor/build-cursor-scope';
import {
  decodeCursor,
  encodeCursor,
} from '@/app/repositories/common/mysql/utils/cursor/encode-cursor';
import {
  isSameOrderDeclaration,
  parseOrderQuery,
} from '@/app/repositories/common/mysql/utils/cursor/parse-order';
import { DemoRepository } from '@/app/repositories/demo.repository';
import type { AppConfigType } from '@/configs/app.config';
import appConfig from '@/configs/app.config';
import { demosSchema } from '@/database/mysql/schemas/demos.schema';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, gte, like, lte, SQL } from 'drizzle-orm';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import {
  DEMO_ORDERABLE_COLUMNS,
  FindManyDemoByCursoredPaginationRequestDto,
  FindManyDemoByPaginationRequestDto,
} from './dtos/find-many-demo-request.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';

/** Demo 列表 resourceKey（写入 cursor.scope，防用户/管理互串） */
export const DEMO_LIST_RESOURCE_KEY = 'demo.list';
export const ADMIN_DEMO_LIST_RESOURCE_KEY = 'admin.demo.list';

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
  constructor(
    protected readonly demoRepository: DemoRepository,
    @Inject(appConfig.KEY) private readonly _appConfig: AppConfigType,
  ) {}

  /**
   * 创建 Demo（仓储 create 自动分配长码 publicId + 短码 shortPublicId）
   * @returns 内部 id 与两类公开标识，供用户端/admin 端各自挑选响应字段
   */
  async create(body: CreateDemoRequestDto): Promise<{
    id: number;
    publicId: string;
    shortPublicId: string;
  }> {
    return this.demoRepository.create({ data: body });
  }

  /**
   * 查询全部 Demo（无分页）
   */
  async findAll() {
    return await this.demoRepository.findAll({});
  }

  /**
   * 加密游标分页（用户端与管理端共用；仅 resourceKey 不同）
   */
  async findManyByCursorPagination(
    query: FindManyDemoByCursoredPaginationRequestDto,
    resourceKey: string,
  ) {
    const { cursor, limit, order: orderRaw, ...filterOptions } = query;
    const order = parseOrderQuery(orderRaw, DEMO_ORDERABLE_COLUMNS);
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
      data: result.data,
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
    return await this.demoRepository.findManyWithPagination({
      page: page ?? 1,
      pageSize: pageSize ?? 30,
      filter: filters,
      order: {
        column: orderColumn ?? 'id',
        direction: orderDirection ?? 'desc',
      },
    });
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
    return await this.demoRepository.findOne({ id });
  }

  /**
   * 按公开标识查询（用户端）
   */
  async findOneByPublicId(publicId: string) {
    return await this.demoRepository.findOneByPublicId({ publicId });
  }

  /**
   * 按内部主键更新（admin）
   */
  async update(id: number, body: UpdateDemoRequestDto) {
    return await this.demoRepository.update({ id, data: body });
  }

  /**
   * 按公开标识更新（用户端）：先解析出内部 id 再更新
   */
  async updateByPublicId(publicId: string, body: UpdateDemoRequestDto) {
    const row = await this.demoRepository.findOneByPublicId({ publicId });
    if (!row) {
      return;
    }
    return await this.demoRepository.update({ id: row.id, data: body });
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
      return;
    }
    return await this.demoRepository.delete({ id: row.id });
  }
}
