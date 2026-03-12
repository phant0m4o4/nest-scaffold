import { applyDecorators } from '@nestjs/common';
import { ClassConstructor } from 'class-transformer';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export function ArrayOkResponse(
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
        },
      },
    }),
  );
  return applyDecorators(...decorators);
}
