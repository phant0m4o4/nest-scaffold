import { afterEach, describe, expect, it, vi } from 'vitest';

import queueConfig from '../queue.config';

function stubQueueEnvironment(keyPrefix?: string): void {
  vi.stubEnv('QUEUE_REDIS_MODE', 'single');
  vi.stubEnv('QUEUE_REDIS_HOST', '127.0.0.1');
  vi.stubEnv('QUEUE_REDIS_PORT', '6379');
  vi.stubEnv('QUEUE_REDIS_DB', '2');
  vi.stubEnv('QUEUE_KEY_PREFIX', keyPrefix);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('队列配置', () => {
  it('未指定前缀时使用普通的 queue 前缀', () => {
    stubQueueEnvironment();

    expect(queueConfig().keyPrefix).toBe('queue');
  });

  it('应接受普通自定义前缀', () => {
    stubQueueEnvironment('jobs');

    expect(queueConfig().keyPrefix).toBe('jobs');
  });

  it('哨兵模式同样使用普通前缀并保留专用 DB', () => {
    stubQueueEnvironment();
    vi.stubEnv('QUEUE_REDIS_MODE', 'sentinel');
    vi.stubEnv('QUEUE_REDIS_SENTINEL_MASTER_NAME', 'mymaster');
    vi.stubEnv('QUEUE_REDIS_SENTINELS', '127.0.0.1:26379');

    expect(queueConfig().keyPrefix).toBe('queue');
    expect(queueConfig().connection).toMatchObject({
      mode: 'sentinel',
      sentinel: { db: 2 },
    });
  });
});
