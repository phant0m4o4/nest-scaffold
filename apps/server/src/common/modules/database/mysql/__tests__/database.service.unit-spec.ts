import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mysqlMocks = vi.hoisted(() => ({
  createPool: vi.fn(),
  drizzle: vi.fn().mockReturnValue({}),
}));

vi.mock('mysql2/promise', () => ({ createPool: mysqlMocks.createPool }));
vi.mock('drizzle-orm/mysql2', () => ({ drizzle: mysqlMocks.drizzle }));

import { DatabaseService } from '../database.service';

function buildConfigService(): ConfigService {
  return {
    getOrThrow: vi.fn().mockReturnValue({
      host: '127.0.0.1',
      port: 3306,
      database: 'test',
      user: 'root',
      password: 'secret',
    }),
  } as unknown as ConfigService;
}

function buildLogger(): PinoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as PinoLogger;
}

describe('MySQL DatabaseService 生命周期', () => {
  const connection = {
    ping: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn(),
    end: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connection.ping.mockResolvedValue(undefined);
    pool.getConnection.mockResolvedValue(connection);
    pool.end.mockResolvedValue(undefined);
    mysqlMocks.createPool.mockReturnValue(pool);
  });

  it('健康检查失败时应先释放连接并关闭连接池', async () => {
    connection.ping.mockRejectedValue(new Error('PING_FAILED'));
    const service = new DatabaseService(buildConfigService(), buildLogger());

    await expect(service.onModuleInit()).rejects.toThrow('PING_FAILED');

    expect(connection.release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('健康检查成功时也应释放探测连接', async () => {
    const service = new DatabaseService(buildConfigService(), buildLogger());

    await service.onModuleInit();

    expect(connection.release).toHaveBeenCalledOnce();
    expect(pool.end).not.toHaveBeenCalled();
  });
});
