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
import { DemoService } from './demo.service';
import { CreateDemoRequestDto } from './dtos/create-demo-request.dto';
import { FindManyDemoByCursoredPaginationRequestDto } from './dtos/find-many-demo-request.dto';
import { FindOneDemoParamDto } from './dtos/find-one-demo-param.dto';
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';
import { DemoEntity } from './entities/demo.entity';

/**
 * demo控制器
 * @description
 * 提供demo相关的RESTful API接口
 */
@Controller('demo')
export class DemoController {
  constructor(protected readonly demoService: DemoService) {}
  /**
   * 创建demo
   */
  @Post()
  async create(@Body() body: CreateDemoRequestDto) {
    const id = await this.demoService.create(body);
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
   * 分页查询资源
   */
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindManyDemoByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.demoService.findManyByCursorPagination(query);
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
