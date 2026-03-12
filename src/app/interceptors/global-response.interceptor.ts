import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** 控制器方法返回的原始数据结构 */
interface IHandlerPayload {
  data?: unknown;
  meta?: Record<string, unknown>;
}

/** 最终返回给客户端的统一响应体 */
interface IFormattedResponse extends IHandlerPayload {
  statusCode: number;
}

/**
 * 全局响应拦截器
 * 将控制器返回值包装为统一格式 { statusCode, data?, meta? }
 */
@Injectable()
export class GlobalResponseInterceptor implements NestInterceptor<
  IHandlerPayload,
  IFormattedResponse
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<IHandlerPayload>,
  ): Observable<IFormattedResponse> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((payload) => ({
        statusCode: response.statusCode,
        ...payload,
      })),
    );
  }
}
