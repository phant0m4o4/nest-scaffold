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
import {
  __FEATURE___LIST_RESOURCE_KEY,
  __Feature__Service,
} from './__feature__.service';
import { Create__Feature__RequestDto } from './dtos/create-__feature__-request.dto';
import {
  FindMany__Feature__ByCursoredPaginationRequestDto,
  FindMany__Feature__ByPaginationRequestDto,
} from './dtos/find-many-__feature__-request.dto';
import { FindOne__Feature__ByPublicIdParamDto } from './dtos/find-one-__feature__-by-public-id-param.dto';
import { Update__Feature__RequestDto } from './dtos/update-__feature__-request.dto';
import { __Feature__PublicEntity } from './entities/__feature__-public.entity';

/**
 * __feature__ 用户端控制器
 *
 * 路径与创建响应用长码列（模板占位名 publicId，请改成业务语义名）；
 * 游标分页返回加密 nextCursor；页码见 /by-page。不暴露 bigint id。
 */
@Controller('__features__')
export class __Feature__Controller {
  constructor(protected readonly __featureCamel__Service: __Feature__Service) {}

  /** 创建 __feature__（响应仅长码） */
  @Post()
  async create(@Body() body: Create__Feature__RequestDto) {
    const { publicId } = await this.__featureCamel__Service.create(body);
    return {
      data: OnlyPublicIdEntity.create({ publicId }),
    };
  }

  /** 查询全部（无分页） */
  @Get('all')
  async findAll() {
    const rows = await this.__featureCamel__Service.findAll();
    return {
      data: rows.map((row) => __Feature__PublicEntity.create(row)),
    };
  }

  /** 页码分页（须在 :publicId 之前） */
  @Get('by-page')
  async findManyByPagination(
    @Query() query: FindMany__Feature__ByPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.__featureCamel__Service.findManyByPagination(query);
    return {
      data: data.map((row) => __Feature__PublicEntity.create(row)),
      meta,
    };
  }

  /** 加密游标分页 */
  @Get()
  async findManyByCursorPagination(
    @Query() query: FindMany__Feature__ByCursoredPaginationRequestDto,
  ) {
    const { data, meta } =
      await this.__featureCamel__Service.findManyByCursorPagination(
        query,
        __FEATURE___LIST_RESOURCE_KEY,
      );
    return {
      data: data.map((row) => __Feature__PublicEntity.create(row)),
      meta,
    };
  }

  /** 查询单条 */
  @Get(':publicId')
  async findOne(@Param() params: FindOne__Feature__ByPublicIdParamDto) {
    const row = await this.__featureCamel__Service.findOneByPublicId(
      params.publicId,
    );
    return {
      data: row ? __Feature__PublicEntity.create(row) : null,
    };
  }

  /** 更新 */
  @Patch(':publicId')
  async update(
    @Param() params: FindOne__Feature__ByPublicIdParamDto,
    @Body() body: Update__Feature__RequestDto,
  ) {
    await this.__featureCamel__Service.updateByPublicId(
      params.publicId,
      body,
    );
  }

  /** 删除 */
  @Delete(':publicId')
  async remove(@Param() params: FindOne__Feature__ByPublicIdParamDto) {
    await this.__featureCamel__Service.deleteByPublicId(params.publicId);
  }
}
