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
