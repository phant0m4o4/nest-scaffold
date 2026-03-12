import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ClassConstructor } from 'class-transformer';

/**
 * 普通分页响应装饰器：描述 data + pagination meta 结构。
 */
export function PaginationOkResponse(
  data: ClassConstructor<any>,
  statusCode: number = 200,
) {
  return applyDecorators(
    ApiExtraModels(data),
    ApiOkResponse({
      description: '成功',
      schema: {
        type: 'object',
        properties: {
          statusCode: {
            type: 'number',
            example: statusCode,
          },
          data: {
            type: 'array',
            items: {
              $ref: getSchemaPath(data),
            },
          },
          meta: {
            type: 'object',
            properties: {
              page: {
                type: 'number',
                example: 1,
              },
              pageSize: {
                type: 'number',
                example: 10,
              },
              total: {
                type: 'number',
                example: 100,
              },
              totalPages: {
                type: 'number',
                example: 10,
              },
              hasPreviousPage: {
                type: 'boolean',
                example: false,
              },
              hasNextPage: {
                type: 'boolean',
                example: true,
              },
            },
          },
        },
      },
    }),
  );
}
