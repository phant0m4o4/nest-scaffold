import { __Feature__Repository } from '@/app/repositories/__feature__.repository';
import { Injectable } from '@nestjs/common';
import { SQL } from 'drizzle-orm';
import { Create__Feature__RequestDto } from './dtos/create-__feature__-request.dto';
import { FindMany__Feature__ByCursoredPaginationRequestDto } from './dtos/find-many-__feature__-request.dto';
import { Update__Feature__RequestDto } from './dtos/update-__feature__-request.dto';

/** __feature__ 过滤条件 */
interface I__Feature__FilterOptions {
  // TODO: 按业务字段补充
}

@Injectable()
export class __Feature__Service {
  constructor(
    protected readonly __featureCamel__Repository: __Feature__Repository,
  ) {}

  /** 创建 __feature__ */
  async create(body: Create__Feature__RequestDto) {
    return await this.__featureCamel__Repository.create({ data: body });
  }

  /** 查询全部 __feature__（无分页） */
  async findAll() {
    return await this.__featureCamel__Repository.findAll({});
  }

  /** 游标分页查询 __feature__ */
  async findManyByCursorPagination(
    query: FindMany__Feature__ByCursoredPaginationRequestDto,
  ) {
    const { cursor, limit, orderColumn, orderDirection, ...filterOptions } =
      query;
    const filters = this._buildFilters(filterOptions);
    return await this.__featureCamel__Repository.findManyWithCursorPagination({
      limit: limit ?? 30,
      cursor,
      order: {
        column: orderColumn ?? 'id',
        direction: (orderDirection ?? 'desc') as 'asc' | 'desc',
      },
      filter: filters,
    });
  }

  /** 查询单条 __feature__ */
  async findOne(id: number) {
    return await this.__featureCamel__Repository.findOne({ id });
  }

  /** 更新 __feature__ */
  async update(id: number, body: Update__Feature__RequestDto) {
    return await this.__featureCamel__Repository.update({ id, data: body });
  }

  /** 删除 __feature__ */
  async delete(id: number) {
    return await this.__featureCamel__Repository.delete({ id });
  }

  /**
   * 构建过滤条件 SQL 数组
   * @private
   */
  private _buildFilters(_options: I__Feature__FilterOptions): SQL[] {
    const filters: SQL[] = [];
    // TODO: 按业务字段构造 eq/like/gte/lte
    return filters;
  }
}
