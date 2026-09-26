import { afterEach, describe, expect, it, vi } from 'vitest';

import queueConfig from '../queue.config';

function stubClusterEnvironment(keyPrefix?: string): void {
  vi.stubEnv('QUEUE_REDIS_MODE', 'cluster');
  vi.stubEnv('QUEUE_REDIS_CLUSTER_NODES', '127.0.0.1:7000,127.0.0.1:7001');
  vi.stubEnv('QUEUE_REDIS_DB', undefined);
  vi.stubEnv('QUEUE_KEY_PREFIX', keyPrefix);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('queueConfig Redis Cluster hash tag', () => {
  it('cluster 模式未指定前缀时应使用安全的默认 hash tag', () => {
    stubClusterEnvironment();

    expect(queueConfig().keyPrefix).toBe('{queue}');
  });

  it('cluster 模式应拒绝不含 hash tag 的自定义前缀', () => {
    stubClusterEnvironment('queue');

    expect(() => queueConfig()).toThrow(/QUEUE_KEY_PREFIX.*hash-tag/);
  });

  it('cluster 模式应接受含非空 hash tag 的前缀', () => {
    stubClusterEnvironment('{queue:critical}');

    expect(queueConfig().keyPrefix).toBe('{queue:critical}');
  });
});
