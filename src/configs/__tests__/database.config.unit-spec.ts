import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import mysqlDatabaseConfig from '../mysql-database.config';
import pgsqlDatabaseConfig from '../pgsql-database.config';

afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['MYSQL', mysqlDatabaseConfig, 3306],
  ['PGSQL', pgsqlDatabaseConfig, 5432],
] as const)('%s 数据库配置', (prefix, config, defaultPort) => {
  beforeEach(() => {
    // 只执行配置解析，不导入驱动、加载 .env 或连接数据库。
    vi.stubEnv(`${prefix}_HOST`, 'database-config.example.invalid');
    vi.stubEnv(`${prefix}_PORT`, undefined);
    vi.stubEnv(`${prefix}_DATABASE`, 'database_config_test');
    vi.stubEnv(`${prefix}_USER`, 'config-test-user');
    vi.stubEnv(`${prefix}_PASSWORD`, 'config-test-password');
  });

  it.each([undefined, '', '   '])(
    '未提供有效端口值时应使用默认值：%s',
    (port) => {
      vi.stubEnv(`${prefix}_PORT`, port);

      expect(config().port).toBe(defaultPort);
    },
  );

  it.each(['1', '65535'])('应接受合法端口边界：%s', (port) => {
    vi.stubEnv(`${prefix}_PORT`, port);

    expect(config().port).toBe(Number(port));
  });

  it.each(['0', '-1', '65536', '100000', '1.5', 'invalid'])(
    '应在配置阶段拒绝非法端口：%s',
    (port) => {
      vi.stubEnv(`${prefix}_PORT`, port);

      expect(() => config()).toThrow(`${prefix}_PORT`);
    },
  );
});
