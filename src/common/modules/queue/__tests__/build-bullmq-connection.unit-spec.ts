import { Cluster } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { buildBullMqConnection } from '../build-bullmq-connection';

/** mock ioredis：Cluster 构造即连接，测试中以桩类捕获构造参数 */
vi.mock('ioredis', () => ({
  Cluster: class MockCluster {
    constructor(
      public readonly nodes: unknown,
      public readonly options: unknown,
    ) {}
  },
}));

describe('buildBullMqConnection', () => {
  it('single 模式应返回 ioredis 选项对象并关闭重试上限', () => {
    const actual = buildBullMqConnection({
      mode: 'single',
      single: { host: '127.0.0.1', port: 6379, password: 'p', db: 2 },
    });

    expect(actual).toEqual({
      host: '127.0.0.1',
      port: 6379,
      password: 'p',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('sentinel 模式应返回带 name/sentinels 的选项对象并关闭重试上限', () => {
    const actual = buildBullMqConnection({
      mode: 'sentinel',
      sentinel: {
        masterName: 'mymaster',
        sentinels: [
          { host: '10.0.0.1', port: 26379 },
          { host: '10.0.0.2', port: 26379 },
        ],
        password: 'p',
        db: 2,
      },
    });

    expect(actual).toEqual({
      name: 'mymaster',
      sentinels: [
        { host: '10.0.0.1', port: 26379 },
        { host: '10.0.0.2', port: 26379 },
      ],
      password: 'p',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('cluster 模式应返回 Cluster 实例（BullMQ 只接受现成实例）并透传节点与选项', () => {
    const actual = buildBullMqConnection({
      mode: 'cluster',
      cluster: {
        nodes: [
          { host: '10.0.0.1', port: 7000 },
          { host: '10.0.0.2', port: 7001 },
        ],
        password: 'p',
      },
    });

    expect(actual).toBeInstanceOf(Cluster);
    const clusterStub = actual as unknown as {
      nodes: unknown;
      options: unknown;
    };
    expect(clusterStub.nodes).toEqual([
      { host: '10.0.0.1', port: 7000 },
      { host: '10.0.0.2', port: 7001 },
    ]);
    expect(clusterStub.options).toEqual({
      redisOptions: { password: 'p', maxRetriesPerRequest: null },
    });
  });
});
