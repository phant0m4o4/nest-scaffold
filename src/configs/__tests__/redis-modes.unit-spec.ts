import { afterEach, describe, expect, it, vi } from 'vitest';

import bottleneckConfig from '../bottleneck.config';
import cacheConfig from '../cache.config';
import distributedLockConfig from '../distributed-lock.config';
import queueConfig from '../queue.config';

afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['CACHE_REDIS', cacheConfig],
  ['DISTRIBUTED_LOCK_REDIS', distributedLockConfig],
  ['QUEUE_REDIS', queueConfig],
  ['BOTTLENECK_REDIS', bottleneckConfig],
] as const)('%s 连接模式', (prefix, config) => {
  function stubConnection(mode?: string): void {
    vi.stubEnv('BOTTLENECK_MODE', 'redis');
    vi.stubEnv(`${prefix}_MODE`, mode);
    vi.stubEnv(`${prefix}_HOST`, '127.0.0.1');
    vi.stubEnv(`${prefix}_PORT`, '6379');
    vi.stubEnv(`${prefix}_DB`, '3');
    vi.stubEnv(`${prefix}_PASSWORD`, '');
    vi.stubEnv(`${prefix}_SENTINEL_MASTER_NAME`, 'mymaster');
    vi.stubEnv(`${prefix}_SENTINELS`, '127.0.0.1:26379');
  }

  it('默认应使用单机并保留模块独立 DB', () => {
    stubConnection();
    expect(config().connection).toEqual({
      mode: 'single',
      single: { host: '127.0.0.1', port: 6379, db: 3, password: undefined },
    });
  });

  it('应支持哨兵主节点名、地址列表与独立 DB', () => {
    stubConnection('sentinel');
    expect(config().connection).toEqual({
      mode: 'sentinel',
      sentinel: {
        masterName: 'mymaster',
        sentinels: [{ host: '127.0.0.1', port: 26379 }],
        db: 3,
        password: undefined,
      },
    });
  });

  it('旧 Cluster 配置应明确拒绝，不能静默降级', () => {
    stubConnection('cluster');
    vi.stubEnv(`${prefix}_DB`, undefined);
    vi.stubEnv(`${prefix}_CLUSTER_NODES`, '127.0.0.1:7000');
    expect(() => config()).toThrow(`${prefix}_MODE`);
  });
});

it('内存限流仍不要求 Redis 连接配置', () => {
  vi.stubEnv('BOTTLENECK_MODE', 'memory');
  vi.stubEnv('BOTTLENECK_REDIS_MODE', undefined);
  expect(bottleneckConfig().connection).toBeNull();
});
