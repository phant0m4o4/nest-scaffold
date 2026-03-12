import { DemoRepository } from '@/app/repositories/demo.repository';
import { demosSchema } from '@/database/schemas/demos.schema';
import { Injectable } from '@nestjs/common';
import { eq, gte, like, lte, SQL } from 'drizzle-orm';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import {
  FindManyDemoByCursoredPaginationRequestDto,
  FindManyDemoByPaginationRequestDto,
} from './dtos/find-many-demo-request.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';

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
  constructor(protected readonly demoRepository: DemoRepository) {}

  /**
   * 创建 Demo
   */
  async create(body: CreateDemoRequestDto) {
    return await this.demoRepository.create({ data: body });
  }

  /**
   * 查询全部 Demo（无分页）
   */
  async findAll() {
    return await this.demoRepository.findAll({});
  }

  /**
   * 游标分页查询 Demo，支持多条件过滤
   */
  async findManyByCursorPagination(
    query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { cursor, limit, orderColumn, orderDirection, ...filterOptions } =
      query;
    const filters = this._buildFilters(filterOptions);
    return await this.demoRepository.findManyWithCursorPagination({
      limit: limit ?? 30,
      cursor,
      order: {
        column: orderColumn ?? 'id',
        direction: (orderDirection ?? 'desc') as 'asc' | 'desc',
      },
      filter: filters,
    });
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
        direction: (orderDirection ?? 'desc') as 'asc' | 'desc',
      },
    });
  }

  /**
   * 构建过滤条件 SQL 数组
   * @param options - 过滤选项
   * @returns SQL 条件数组
   * @private
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
   * 查询单条 Demo
   */
  async findOne(id: number) {
    return await this.demoRepository.findOne({ id });
  }

  /**
   * 更新 Demo
   */
  async update(id: number, body: UpdateDemoRequestDto) {
    return await this.demoRepository.update({ id, data: body });
  }

  /**
   * 删除 Demo
   */
  async delete(id: number) {
    return await this.demoRepository.delete({ id });
  }
}
