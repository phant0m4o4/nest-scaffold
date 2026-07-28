import { OnlyPublicIdEntity } from '@/app/api/common/entities/only-public-id.entity';
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
import { DemoService } from './demo.service';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import { FindOneDemoByPublicIdParamDto } from './dtos/find-one-demo-by-public-id-param.dto';
import { FindManyDemoByCursoredPaginationRequestDto } from './dtos/find-many-demo-request.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';
import { DemoPublicEntity } from './entities/demo-public.entity';

/**
 * Demo 用户端控制器
 *
 * 路径与创建响应用长码 `publicId`；列表/详情实体可带短码 `shortPublicId`。
 * 不暴露 bigint 自增主键。
 */
@Controller('demo')
export class DemoController {
  constructor(protected readonly demoService: DemoService) {}

  /**
   * 创建 demo（响应仅返回长码 publicId）
   */
  @Post()
  async create(@Body() body: CreateDemoRequestDto) {
    const { publicId } = await this.demoService.create(body);
    return {
      data: OnlyPublicIdEntity.create({ publicId }),
    };
  }

  /**
   * 查询全部资源（无分页）
   */
  @Get('all')
  async findAll() {
    const rows = await this.demoService.findAll();
    return { data: rows.map((row) => DemoPublicEntity.create(row)) };
  }

  /**
   * 分页查询资源
   */
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.demoService.findManyByCursorPagination(query);
    return {
      data: data.map((row) => DemoPublicEntity.create(row)),
      meta,
    };
  }

  /**
   * 查询单条资源
   */
  @Get(':publicId')
  async findOne(@Param() params: FindOneDemoByPublicIdParamDto) {
    const row = await this.demoService.findOneByPublicId(params.publicId);
    return { data: row ? DemoPublicEntity.create(row) : null };
  }

  /**
   * 更新资源
   */
  @Patch(':publicId')
  async update(
    @Param() params: FindOneDemoByPublicIdParamDto,
    @Body() body: UpdateDemoRequestDto,
  ) {
    await this.demoService.updateByPublicId(params.publicId, body);
  }

  /**
   * 删除单条资源
   */
  @Delete(':publicId')
  async remove(@Param() params: FindOneDemoByPublicIdParamDto) {
    await this.demoService.deleteByPublicId(params.publicId);
  }
}
