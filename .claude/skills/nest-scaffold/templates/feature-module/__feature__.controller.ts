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
import { __Feature__Service } from './__feature__.service';
import { Create__Feature__RequestDto } from './dtos/create-__feature__-request.dto';
import { FindMany__Feature__ByCursoredPaginationRequestDto } from './dtos/find-many-__feature__-request.dto';
import { FindOne__Feature__ParamDto } from './dtos/find-one-__feature__-param.dto';
import { Update__Feature__RequestDto } from './dtos/update-__feature__-request.dto';
import { __Feature__Entity } from './entities/__feature__.entity';

/**
 * __feature__ 控制器
 * @description 提供 __feature__ 相关的 RESTful API 接口
 */
@Controller('__features__')
export class __Feature__Controller {
  constructor(protected readonly __featureCamel__Service: __Feature__Service) {}

  /** 创建 __feature__ */
  @Post()
  async create(@Body() body: Create__Feature__RequestDto) {
    const id = await this.__featureCamel__Service.create(body);
    return {
      data: OnlyIdEntity.create({ id }),
    };
  }

  /** 查询全部 __feature__（无分页） */
  @Get('all')
  async findAll() {
    const rows = await this.__featureCamel__Service.findAll();
    return {
      data: rows.map((row) => __Feature__Entity.create(row)),
    };
  }

  /** 游标分页查询 __feature__ */
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindMany__Feature__ByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.__featureCamel__Service.findManyByCursorPagination(query);
    return {
      data: data.map((row) => __Feature__Entity.create(row)),
      meta,
    };
  }

  /** 查询单条 __feature__ */
  @Get(':id')
  async findOne(@Param() params: FindOne__Feature__ParamDto) {
    const row = await this.__featureCamel__Service.findOne(params.id);
    return {
      data: row ? __Feature__Entity.create(row) : null,
    };
  }

  /** 更新 __feature__ */
  @Patch(':id')
  async update(
    @Param() params: FindOne__Feature__ParamDto,
    @Body() body: Update__Feature__RequestDto,
  ) {
    await this.__featureCamel__Service.update(params.id, body);
  }

  /** 删除 __feature__ */
  @Delete(':id')
  async remove(@Param() params: FindOne__Feature__ParamDto) {
    await this.__featureCamel__Service.delete(params.id);
  }
}
