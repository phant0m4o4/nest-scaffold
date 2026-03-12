import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ClassConstructor } from 'class-transformer';

export function CursoredPaginationOkResponse(
  data: ClassConstructor<any>,
  statusCode: number = 200,
) {
  const decorators: Array<
    ClassDecorator | MethodDecorator | PropertyDecorator
  > = [];
  decorators.push(ApiExtraModels(data));
  decorators.push(
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
              nextCursor: {
                type: 'number',
                example: 2,
              },
            },
          },
        },
      },
    }),
  );
  return applyDecorators(...decorators);
}
