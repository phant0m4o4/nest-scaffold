import { CacheModule } from '@/common/modules/cache/cache.module';
import { DatabaseModule } from '@/common/modules/database/database.module';
import { DistributedLockModule } from '@/common/modules/distributed-lock/distributed-lock.module';
import { I18nModule } from '@/common/modules/i18n/i18n.module';
import { LoggerModule } from '@/common/modules/logger/logger.module';
import { QueueModule } from '@/common/modules/queue/queue.module';
import appConfig from '@/configs/app.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiModule } from '@/app/api/api.module';
import { GlobalResponseInterceptor } from '@/app/interceptors/global-response.interceptor';

@Module({
  imports: [
    //配置模块
    ConfigModule.forRoot({
      cache: true,
      expandVariables: true,
      load: [appConfig],
    }),
    //日志模块(全局)
    LoggerModule.forRoot({ name: 'app' }),
    //国际化模块(全局)
    I18nModule,
    //缓存模块
    CacheModule,
    //数据库模块
    DatabaseModule.forRoot({
      isGlobal: true,
    }),
    // 分布式锁模块
    DistributedLockModule,
    // 队列模块
    QueueModule,
    // API模块
    ApiModule,
  ],
  providers: [
    // 全局响应拦截器 用于添加statusCode到响应头中
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalResponseInterceptor,
    },
  ],
})
export class AppModule {}
