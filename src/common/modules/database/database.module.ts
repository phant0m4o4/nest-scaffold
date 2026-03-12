import databaseConfig from '@/configs/database.config';
import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  DATABASE_INIT_INITIALIZER,
  DATABASE_SEEDER,
} from './constants/database.tokens';
import { DatabaseService } from './database.service';
import type { IInitInitializer } from './interfaces/init-initializer.interface';
import type { ISeeder } from './interfaces/seeder.interface';

/**
 * 数据库模块配置选项
 */
export interface DatabaseModuleOptions {
  /** 是否设置为全局模块，默认 false */
  isGlobal?: boolean;
  /** 数据库初始化器（类或 Provider），用于 db:init 脚本 */
  initInitializer?: Type<IInitInitializer> | Provider<IInitInitializer>;
  /** 数据库种子数据填充器（类或 Provider），用于 db:seed 脚本 */
  seeder?: Type<ISeeder> | Provider<ISeeder>;
}

/**
 * 判断 Provider 是否为对象形式（含 provide 属性），而非类引用
 */
function _isObjectProvider(
  provider: Provider,
): provider is Provider & { provide: symbol | string | Type } {
  return Object.prototype.hasOwnProperty.call(provider, 'provide') === true;
}

/**
 * 将实现注册为指定 Token 的 Provider
 *
 * - 类形式：直接 useClass 注册
 * - 对象形式：先注册原 Provider，再通过 useExisting 别名到目标 Token
 */
function _buildTokenProviders<T>(
  token: symbol,
  impl: Type<T> | Provider<T>,
): Provider[] {
  if (_isObjectProvider(impl as Provider)) {
    const objProvider = impl as Provider & { provide: symbol | string | Type };
    return [impl, { provide: token, useExisting: objProvider.provide }];
  }
  return [{ provide: token, useClass: impl as Type<T> }];
}

/**
 * 数据库模块
 *
 * 基于 Drizzle ORM + MySQL2，提供：
 * - `DatabaseService`：数据库连接管理与 Drizzle 实例
 * - 可选 `initInitializer`：数据库结构初始化（db:init 脚本）
 * - 可选 `seeder`：种子数据填充（db:seed 脚本）
 *
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {
  /**
   * 创建动态数据库模块
   * @param options 配置选项
   */
  static forRoot(options: DatabaseModuleOptions = {}): DynamicModule {
    const { isGlobal, initInitializer, seeder } = options;
    const extraProviders: Provider[] = [];
    if (initInitializer) {
      extraProviders.push(
        ..._buildTokenProviders(DATABASE_INIT_INITIALIZER, initInitializer),
      );
    }
    if (seeder) {
      extraProviders.push(..._buildTokenProviders(DATABASE_SEEDER, seeder));
    }
    const exports: (typeof DatabaseService | symbol)[] = [DatabaseService];
    if (initInitializer) exports.push(DATABASE_INIT_INITIALIZER);
    if (seeder) exports.push(DATABASE_SEEDER);
    return {
      module: DatabaseModule,
      global: isGlobal ?? false,
      providers: [DatabaseService, ...extraProviders],
      exports,
    };
  }
}
