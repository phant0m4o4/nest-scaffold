import { OnlyIdEntity } from '@/app/api/common/entities/only-id.entity';
import { ArrayOkResponse } from '@/common/decorators/swagger/responses/array-ok-response.decorator';
import { CreatedResponse } from '@/common/decorators/swagger/responses/created-response.decorator';
import { CursoredPaginationOkResponse } from '@/common/decorators/swagger/responses/cursored-pagination-ok-response.decorator';
import { OkResponse } from '@/common/decorators/swagger/responses/ok-response.decorator';
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
import { plainToInstance } from 'class-transformer';
import { __Feature__Service } from './__feature__.service';
import { Create__Feature__RequestDto } from './dtos/create-__feature__-request.dto';
import { FindMany__Feature__ByCursoredPaginationRequestDto } from './dtos/find-many-__feature__-request.dto';
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
  @CreatedResponse(OnlyIdEntity)
  @Post()
  async create(@Body() body: Create__Feature__RequestDto) {
    const id = await this.__featureCamel__Service.create(body);
    return {
      data: plainToInstance(
        OnlyIdEntity,
        { id },
        { excludeExtraneousValues: true },
      ),
    };
  }

  /** 查询全部 __feature__（无分页） */
  @ArrayOkResponse(__Feature__Entity)
  @Get('all')
  async findAll() {
    const rows = await this.__featureCamel__Service.findAll();
    return {
      data: rows.map((row) =>
        plainToInstance(__Feature__Entity, row, {
          excludeExtraneousValues: true,
        }),
      ),
    };
  }

  /** 游标分页查询 __feature__ */
  @CursoredPaginationOkResponse(__Feature__Entity)
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindMany__Feature__ByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.__featureCamel__Service.findManyByCursorPagination(query);
    return {
      data: data.map((row) =>
        plainToInstance(__Feature__Entity, row, {
          excludeExtraneousValues: true,
        }),
      ),
      meta,
    };
  }

  /** 查询单条 __feature__ */
  @OkResponse(__Feature__Entity)
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const row = await this.__featureCamel__Service.findOne(id);
    return {
      data: plainToInstance(__Feature__Entity, row, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /** 更新 __feature__ */
  @OkResponse()
  @Patch(':id')
  async update(
    @Param('id') id: number,
    @Body() body: Update__Feature__RequestDto,
  ) {
    await this.__featureCamel__Service.update(id, body);
  }

  /** 删除 __feature__ */
  @OkResponse()
  @Delete(':id')
  async remove(@Param('id') id: number) {
    await this.__featureCamel__Service.delete(id);
  }
}
