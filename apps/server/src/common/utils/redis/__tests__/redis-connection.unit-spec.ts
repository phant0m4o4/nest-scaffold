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

  it.each([0, -1, 65536, 6379.5, NaN, Infinity])(
    'single 模式拒绝非法端口 %s',
    (port) => {
      expect(() =>
        resolveRedisConnection({ ...baseSingle, port }),
      ).toThrowError('MY_REDIS_PORT');
    },
  );

  it.each([1, 65535])('single 模式接受边界端口 %s', (port) => {
    const actual = resolveRedisConnection({ ...baseSingle, port });

    expect(actual.mode === 'single' && actual.single.port).toBe(port);
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
        mode: 'sentinel',
        sentinelMasterName: 'mymaster',
        sentinels: ' , ,',
        db: 0,
      }),
    ).toThrowError('MY_REDIS_SENTINELS');
  });

  it('不支持的模式应明确报错而不是降级连接', () => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'unsupported',
      } as unknown as Parameters<typeof resolveRedisConnection>[0]),
    ).toThrowError('MY_REDIS_MODE 仅支持 single 或 sentinel');
  });

  it.each([
    'redis',
    'redis:',
    ':26379',
    'redis:abc',
    'redis:0',
    'redis:-1',
    'redis:65536',
    'redis:26379.5',
    'redis:Infinity',
    'redis:2e4',
    'redis:0x670b',
    'redis:26379:ignored',
    'redis: 26379',
    'redis host:26379',
    'redis:26379,other:',
  ])('sentinel 模式拒绝非法节点 %s', (sentinels) => {
    expect(() =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'sentinel',
        sentinelMasterName: 'mymaster',
        sentinels,
        db: 0,
      }),
    ).toThrowError('节点格式错误');
  });

  it('sentinel 模式接受主机名、边界端口及节点两侧的空白', () => {
    const actual = resolveRedisConnection({
      envPrefix: 'MY_REDIS',
      mode: 'sentinel',
      sentinelMasterName: 'mymaster',
      sentinels: ' redis-1.local:1 , redis-2.local:65535 ',
      db: 0,
    });

    expect(actual.mode === 'sentinel' && actual.sentinel.sentinels).toEqual([
      { host: 'redis-1.local', port: 1 },
      { host: 'redis-2.local', port: 65535 },
    ]);
  });

  it('误填含凭据的 URI 时应指出变量名，不回显节点原文', () => {
    const sentinels = 'redis://:synthetic-secret@redis.example.invalid:26379';
    const parse = () =>
      resolveRedisConnection({
        envPrefix: 'MY_REDIS',
        mode: 'sentinel',
        sentinelMasterName: 'mymaster',
        sentinels,
        db: 0,
      });

    expect(parse).toThrowError('MY_REDIS_SENTINELS');
    expect(parse).not.toThrowError(/synthetic-secret|redis\.example\.invalid/);
  });
});
