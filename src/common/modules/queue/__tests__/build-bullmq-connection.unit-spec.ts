import { describe, expect, it } from 'vitest';

import { buildBullMqConnection } from '../build-bullmq-connection';

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
});
