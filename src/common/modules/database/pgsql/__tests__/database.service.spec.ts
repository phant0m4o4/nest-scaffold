import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pgsqlMocks = vi.hoisted(() => ({
  pool: {
    connect: vi.fn(),
    end: vi.fn(),
  },
  drizzle: vi.fn().mockReturnValue({}),
}));

vi.mock('pg', () => ({
  Pool: class MockPool {
    connect = pgsqlMocks.pool.connect;
    end = pgsqlMocks.pool.end;
  },
}));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: pgsqlMocks.drizzle }));

import { DatabaseService } from '../database.service';

function buildConfigService(): ConfigService {
  return {
    getOrThrow: vi.fn().mockReturnValue({
      host: '127.0.0.1',
      port: 5432,
      database: 'test',
      user: 'postgres',
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

describe('PostgreSQL DatabaseService 生命周期', () => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    pgsqlMocks.pool.connect.mockResolvedValue(client);
    pgsqlMocks.pool.end.mockResolvedValue(undefined);
  });

  it('健康检查失败时应先释放 client 并关闭连接池', async () => {
    client.query.mockRejectedValue(new Error('QUERY_FAILED'));
    const service = new DatabaseService(buildConfigService(), buildLogger());

    await expect(service.onModuleInit()).rejects.toThrow('QUERY_FAILED');

    expect(client.release).toHaveBeenCalledOnce();
    expect(pgsqlMocks.pool.end).toHaveBeenCalledOnce();
  });

  it('健康检查成功时也应释放探测 client', async () => {
    const service = new DatabaseService(buildConfigService(), buildLogger());

    await service.onModuleInit();

    expect(client.release).toHaveBeenCalledOnce();
    expect(pgsqlMocks.pool.end).not.toHaveBeenCalled();
  });
});
