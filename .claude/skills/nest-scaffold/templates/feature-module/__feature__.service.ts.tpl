import { ICursorKeysetItem } from '@/app/repositories/common/interfaces/cursor-keyset.interface';
import { __Feature__Repository } from '@/app/repositories/__feature__.repository';
import { buildCursorScope } from '@/app/repositories/common/mysql/utils/cursor/build-cursor-scope';
import {
  decodeCursor,
  encodeCursor,
} from '@/app/repositories/common/mysql/utils/cursor/encode-cursor';
import {
  isSameOrderDeclaration,
  parseOrderQuery,
} from '@/app/repositories/common/mysql/utils/cursor/parse-order';
import appConfig from '@/configs/app.config';
import type { AppConfigType } from '@/configs/app.config';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SQL } from 'drizzle-orm';
import { Create__Feature__RequestDto } from './dtos/create-__feature__-request.dto';
import {
  __FEATURE___ORDERABLE_COLUMNS,
  FindMany__Feature__ByCursoredPaginationRequestDto,
  FindMany__Feature__ByPaginationRequestDto,
} from './dtos/find-many-__feature__-request.dto';
import { Update__Feature__RequestDto } from './dtos/update-__feature__-request.dto';

/** 列表 resourceKey（写入 cursor.scope） */
export const __FEATURE___LIST_RESOURCE_KEY = '__features__.list';

/** __feature__ 过滤条件 */
interface I__Feature__FilterOptions {
  name?: string;
  // TODO: 按业务字段补充
}

@Injectable()
export class __Feature__Service {
  constructor(
    protected readonly __featureCamel__Repository: __Feature__Repository,
    @Inject(appConfig.KEY) private readonly _appConfig: AppConfigType,
  ) {}

  /** 创建（仓储分配长码 + 短码） */
  async create(body: Create__Feature__RequestDto): Promise<{
    id: number;
    publicId: string;
    shortPublicId: string;
  }> {
    return this.__featureCamel__Repository.create({ data: body });
  }

  async findAll() {
    return await this.__featureCamel__Repository.findAll({});
  }

  /** 加密游标分页 */
  async findManyByCursorPagination(
    query: FindMany__Feature__ByCursoredPaginationRequestDto,
    resourceKey: string = __FEATURE___LIST_RESOURCE_KEY,
  ) {
    const { cursor, limit, order: orderRaw, ...filterOptions } = query;
    const order = parseOrderQuery(orderRaw, __FEATURE___ORDERABLE_COLUMNS);
    const scope = buildCursorScope(
      resourceKey,
      filterOptions as Record<string, unknown>,
    );

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
    const result =
      await this.__featureCamel__Repository.findManyWithCursorPagination({
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

  /** 页码分页 */
  async findManyByPagination(query: FindMany__Feature__ByPaginationRequestDto) {
    const { page, pageSize, orderColumn, orderDirection, ...filterOptions } =
      query;
    const filters = this._buildFilters(filterOptions);
    return await this.__featureCamel__Repository.findManyWithPagination({
      page: page ?? 1,
      pageSize: pageSize ?? 30,
      filter: filters,
      order: {
        column: orderColumn ?? 'id',
        direction: (orderDirection ?? 'desc') as 'asc' | 'desc',
      },
    });
  }

  async findOneByPublicId(publicId: string) {
    return await this.__featureCamel__Repository.findOneByPublicId({
      publicId,
    });
  }

  async updateByPublicId(publicId: string, body: Update__Feature__RequestDto) {
    const row = await this.__featureCamel__Repository.findOneByPublicId({
      publicId,
    });
    if (!row) {
      return;
    }
    return await this.__featureCamel__Repository.update({
      id: row.id,
      data: body,
    });
  }

  async deleteByPublicId(publicId: string) {
    const row = await this.__featureCamel__Repository.findOneByPublicId({
      publicId,
    });
    if (!row) {
      return;
    }
    return await this.__featureCamel__Repository.delete({ id: row.id });
  }

  private _buildFilters(_options: I__Feature__FilterOptions): SQL[] {
    const filters: SQL[] = [];
    // TODO: 按业务字段构造 eq/like/gte/lte
    return filters;
  }
}
