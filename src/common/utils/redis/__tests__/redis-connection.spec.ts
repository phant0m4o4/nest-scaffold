import { describe, expect, it } from 'vitest';

import { resolveRedisConnection } from '../redis-connection';

describe('resolveRedisConnection', () => {
  const baseSingle = {
    envPrefix: 'MY_REDIS',
    host: '127.0.0.1',
    port: 6379,
    db: 1,
  };

  it('single 模式应映射出完整连接配置（默认 mode 为 single）', () => {
    const actual = resolveRedisConnection({ ...baseSingle, password: 'p' });

    expect(actual).toEqual({
      mode: 'single',
      single: { host: '127.0.0.1', port: 6379, password: 'p', db: 1 },
    });
  });

  it.each([
    ['host', { ...baseSingle, host: undefined }, 'MY_REDIS_HOST'],
    ['port', { ...baseSingle, port: undefined }, 'MY_REDIS_PORT'],
    ['db', { ...baseSingle, db: undefined }, 'MY_REDIS_DB'],
  ])('single 模式缺少 %s 时应报错并指明环境变量名', (_field, input, envVar) => {
    expect(() => resolveRedisConnection(input)).toThrowError(envVar);
  });

  it('db 为 0 是合法值,不应被当作缺失', () => {
    const actual = resolveRedisConnection({ ...baseSingle, db: 0 });

    expect(actual.mode === 'single' && actual.single.db).toBe(0);
  });

  it('空串密码应归一为未设置（锚点变量缺失时 ${...} 展开为空串）', () => {
    const actual = resolveRedisConnection({ ...baseSingle, password: '' });

    expect(actual.mode === 'single' && actual.single.password).toBeUndefined();
  });

  it('sentinel 模式应解析节点列表', () => {
    const actual = resolveRedisConnection({
      envPrefix: 'MY_REDIS',
      mode: 'sentinel',
      sentinelMasterName: 'mymaster',
      sentinels: '10.0.0.1:26379, 10.0.0.2:26379',
      db: 0,
    });

    expect(actual).toEqual({
      mode: 'sentinel',
      sentinel: {
        masterName: 'mymaster',
        sentinels: [
          { host: '10.0.0.1', port: 26379 },
          { host: '10.0.0.2', port: 26379 },
        ],
        password: undefined,
        db: 0,
      },
    });
  });

  it('sentinel 模式缺少 master 名或节点列表时应报错并指明环境变量名', () => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'sentinel',
        sentinels: '10.0.0.1:26379',
        db: 0,
      }),
    ).toThrowError('MY_REDIS_SENTINEL_MASTER_NAME');
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'sentinel',
        sentinelMasterName: 'mymaster',
        db: 0,
      }),
    ).toThrowError('MY_REDIS_SENTINELS');
  });

  it('节点列表为空白或纯逗号时应报错并指明环境变量名', () => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'cluster',
        clusterNodes: ' , ,',
      }),
    ).toThrowError('MY_REDIS_CLUSTER_NODES');
  });

  it('cluster 模式下显式设置 db 应报错（静默丢弃会制造隔离已生效的假象）', () => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'cluster',
        clusterNodes: '10.0.0.1:7000,10.0.0.2:7001',
        db: 7,
      }),
    ).toThrowError('MY_REDIS_DB 在 cluster 模式下无效');
  });

  it('cluster 模式应解析节点列表且无 db 字段', () => {
    const actual = resolveRedisConnection({
      envPrefix: 'MY_REDIS',
      mode: 'cluster',
      clusterNodes: '10.0.0.1:7000,10.0.0.2:7001',
    });

    expect(actual).toEqual({
      mode: 'cluster',
      cluster: {
        nodes: [
          { host: '10.0.0.1', port: 7000 },
          { host: '10.0.0.2', port: 7001 },
        ],
        password: undefined,
      },
    });
  });

  it('节点格式非法（端口非数字）时应报错', () => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'cluster',
        clusterNodes: '10.0.0.1:abc',
      }),
    ).toThrowError('节点格式错误');
  });
});
