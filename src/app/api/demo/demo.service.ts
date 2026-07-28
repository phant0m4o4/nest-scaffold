import { DemoRepository } from '@/app/repositories/demo.repository';
import { demosSchema } from '@/database/mysql/schemas/demos.schema';
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
        direction: orderDirection ?? 'desc',
      },
      filter: filters,
    });
  }

  /**
   * 普通分页查询 Demo，支持多条件过滤
   *
   * 示例保留：演示 `findManyWithPagination` 的用法，当前控制器未暴露对应路由
   * （默认走游标分页），需要 offset 分页时在控制器加路由接入即可。
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
