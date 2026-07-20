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
import { UpdateDemoRequestDto } from './dtos/update-demo-request.dto';

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
    const data = await this.demoService.findAll();
    return { data };
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
    return { data, meta };
  }

  /**
   * 查询单条资源
   */
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const data = await this.demoService.findOne(id);
    return { data };
  }

  /**
   * 更新资源
   */
  @Patch(':id')
  async update(@Param('id') id: number, @Body() body: UpdateDemoRequestDto) {
    await this.demoService.update(id, body);
  }

  /**
   * 删除单条资源
   */
  @Delete(':id')
  async remove(@Param('id') id: number) {
    await this.demoService.delete(id);
  }
}
