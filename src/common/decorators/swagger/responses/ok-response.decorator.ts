import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ClassConstructor } from 'class-transformer';

export function OkResponse(
  data?: ClassConstructor<any>,
  statusCode: number = 200,
) {
  const decorators: Array<
    ClassDecorator | MethodDecorator | PropertyDecorator
  > = [];
  if (data) {
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
              type: 'object',
              $ref: getSchemaPath(data),
            },
          },
        },
      }),
    );
  } else {
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
          },
        },
      }),
    );
  }
  return applyDecorators(...decorators);
}
