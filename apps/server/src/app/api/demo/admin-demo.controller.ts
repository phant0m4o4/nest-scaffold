import { OnlyIdEntity } from '@/app/api/common/entities/only-id.entity';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ADMIN_DEMO_LIST_RESOURCE_KEY, DemoService } from './demo.service';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import {
  FindManyDemoByCursoredPaginationRequestDto,
  FindManyDemoByPaginationRequestDto,
} from './dtos/find-many-demo-request.dto';
import { FindOneDemoParamDto } from './dtos/find-one-demo-param.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';
import { DemoEntity } from './entities/demo.entity';

/**
 * Demo 管理端控制器
 *
 * 可暴露 bigint 自增 `id`（同时保留长码 `publicId` / 短码 `shortPublicId` 便于对照）。
 * 游标与用户端同一套加密逻辑（resourceKey 不同）；页码分页见 `/by-page`。
 * 真实项目中应在此路由加鉴权 / 角色守卫。
 */
@Controller('admin/demo')
export class AdminDemoController {
  constructor(protected readonly demoService: DemoService) {}

  /**
   * 创建 demo（响应返回内部 id）
   */
  @Post()
  async create(@Body() body: CreateDemoRequestDto) {
    const { id } = await this.demoService.create(body);
    return {
      data: OnlyIdEntity.create({ id }),
    };
  }

  /**
   * 查询全部资源（无分页）
   */
  @Get('all')
  async findAll() {
    const rows = await this.demoService.findAll();
    return { data: rows.map((row) => DemoEntity.create(row)) };
  }

  /**
   * 页码分页（须声明在 :id 之前）
   */
  @Get('by-page')
  async findManyByPagination(
    @Query() query: FindManyDemoByPaginationRequestDto,
  ) {
    const { data, meta } = await this.demoService.findManyByPagination(query);
    return { data: data.map((row) => DemoEntity.create(row)), meta };
  }

  /**
   * 加密游标分页
   */
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { data, meta } = await this.demoService.findManyByCursorPagination(
      query,
      ADMIN_DEMO_LIST_RESOURCE_KEY,
    );
    return { data: data.map((row) => DemoEntity.create(row)), meta };
  }

  /**
   * 查询单条资源
   */
  @Get(':id')
  async findOne(@Param() params: FindOneDemoParamDto) {
    const row = await this.demoService.findOne(params.id);
    return { data: row ? DemoEntity.create(row) : null };
  }

  /**
   * 更新资源
   */
  @Patch(':id')
  async update(
    @Param() params: FindOneDemoParamDto,
    @Body() body: UpdateDemoRequestDto,
  ) {
    await this.demoService.update(params.id, body);
  }

  /**
   * 删除单条资源
   */
  @Delete(':id')
  async remove(@Param() params: FindOneDemoParamDto) {
    await this.demoService.delete(params.id);
  }
}
