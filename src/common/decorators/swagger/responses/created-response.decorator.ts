import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { ClassConstructor } from 'class-transformer';

export function CreatedResponse(data?: ClassConstructor<any>) {
  const statusCode = 201;
  const decorators: Array<
    ClassDecorator | MethodDecorator | PropertyDecorator
  > = [];
  if (data) {
    decorators.push(ApiExtraModels(data));
    decorators.push(
      ApiCreatedResponse({
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
      ApiCreatedResponse({
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
