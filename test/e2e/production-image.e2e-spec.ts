import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const allowedOrigin = 'https://frontend.example.test';

describe('生产镜像端到端验证', { concurrent: false }, () => {
  const suppliedImage = process.env.E2E_APP_IMAGE;
  const image = suppliedImage ?? `nest-scaffold-e2e:${randomUUID()}`;
  let builtImage = false;
  let network: StartedNetwork | undefined;
  let mysql: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: StartedTestContainer;
  let baseUrl: string;

  async function docker(args: string[], timeout = 30_000) {
    return execFileAsync('docker', args, {
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
  }

  async function appLogs(): Promise<string> {
    const { stdout, stderr } = await docker(['logs', app.getId()]);
    return stdout + stderr;
  }

  beforeAll(async () => {
    if (!suppliedImage) {
      await docker(['build', '--tag', image, '.'], 480_000);
      builtImage = true;
    }

    network = await new Network().start();
    const password = randomBytes(24).toString('hex');
    // 等待两项都结束再处理失败，避免另一项尚未启动完就进入清理。
    const dependencies = await Promise.allSettled([
      new GenericContainer('mysql:9')
        .withNetwork(network)
        .withNetworkAliases('mysql')
        .withEnvironment({
          MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'),
          MYSQL_DATABASE: 'production_e2e',
          MYSQL_USER: 'production_e2e',
          MYSQL_PASSWORD: password,
        })
        // 官方镜像初始化时会先启动临时服务；这里只接受最终 TCP 服务就绪。
        .withWaitStrategy(Wait.forLogMessage(/port: 3306/))
        .withStartupTimeout(120_000)
        .start()
        .then((container) => (mysql = container)),
      new GenericContainer('redis:8-alpine')
        .withNetwork(network)
        .withNetworkAliases('redis')
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start()
        .then((container) => (redis = container)),
    ]);
    for (const result of dependencies) {
      if (result.status === 'rejected') throw result.reason;
    }

    // 仅传入临时依赖配置，不挂载源码、不读取本机 .env、不覆盖镜像 CMD。
    app = await new GenericContainer(image)
      .withNetwork(network)
      .withEnvironment({
        APP_NAME: 'production-e2e',
        APP_MASTER_KEY: randomBytes(32).toString('hex'),
        APP_CORS_DOMAINS: allowedOrigin,
        MYSQL_HOST: 'mysql',
        MYSQL_PORT: '3306',
        MYSQL_DATABASE: 'production_e2e',
        MYSQL_USER: 'production_e2e',
        MYSQL_PASSWORD: password,
        CACHE_REDIS_HOST: 'redis',
        CACHE_REDIS_PORT: '6379',
        CACHE_REDIS_DB: '0',
        DISTRIBUTED_LOCK_REDIS_HOST: 'redis',
        DISTRIBUTED_LOCK_REDIS_PORT: '6379',
        DISTRIBUTED_LOCK_REDIS_DB: '1',
        QUEUE_REDIS_HOST: 'redis',
        QUEUE_REDIS_PORT: '6379',
        QUEUE_REDIS_DB: '2',
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp('/demo', 3000).forStatusCode(404))
      .withStartupTimeout(60_000)
      .start();
    baseUrl = `http://${app.getHost()}:${app.getMappedPort(3000)}`;
  }, 900_000);

  afterAll(async () => {
    // 即使测试中途失败，也尝试清理所有本套件创建的容器、卷、网络和镜像。
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(
      [app, mysql, redis]
        .filter((container) => container !== undefined)
        .map((container) => container.stop({ timeout: 15_000 })),
    );
    results.push(
      ...(await Promise.allSettled([
        ...(network ? [network.stop()] : []),
        ...(builtImage ? [docker(['image', 'rm', image])] : []),
      ])),
    );
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (errors.length > 0) throw new AggregateError(errors, '临时资源清理失败');
  });

  it('给定生产默认配置，完整应用应连接真实 MySQL 和 Redis 并以非 root 运行', async () => {
    const logs = await appLogs();
    expect(logs).toContain('数据库 MySQL 连接成功');
    expect(logs).toContain('"event":"cache_ready"');
    expect(logs).toContain('"event":"lock_ready"');
    const result = await app.exec([
      'node',
      '-e',
      'console.log(JSON.stringify({ uid: process.getuid(), env: process.env.NODE_ENV }))',
    ]);
    expect(result.exitCode, result.output).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ uid: 1000, env: 'production' });
  });

  it('给定最终镜像，生产 Argon2 原生依赖应能完成哈希与验证', async () => {
    const result = await app.exec([
      'node',
      '-e',
      `const assert = require('node:assert/strict');
       const argon2 = require('argon2');
       (async () => {
         const hash = await argon2.hash('production-image-test');
         assert.equal(await argon2.verify(hash, 'production-image-test'), true);
         assert.equal(await argon2.verify(hash, 'wrong-password'), false);
       })().catch(error => { console.error(error); process.exitCode = 1; });`,
    ]);
    expect(result.exitCode, result.output).toBe(0);
  });

  it('给定最终镜像，应包含翻译和迁移资源且不包含本机配置或测试源码', async () => {
    const result = await app.exec([
      'node',
      '-e',
      `const assert = require('node:assert/strict');
       const fs = require('node:fs');
       for (const language of ['en', 'zh-cn']) {
         for (const resource of ['common', 'error', 'validation']) {
           JSON.parse(fs.readFileSync('dist/i18n/' + language + '/' + resource + '.json', 'utf8'));
         }
       }
       assert.ok(fs.existsSync('drizzle/mysql/meta/_journal.json'));
       for (const path of ['.env', '.env.production', '.ssh', '.git', 'src', 'test']) {
         assert.equal(fs.existsSync(path), false, path);
       }`,
    ]);
    expect(result.exitCode, result.output).toBe(0);
  });

  it('给定空数据库，镜像内迁移应成功且重复执行不应重复写入基础数据', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await app.exec([
        'node',
        'node_modules/drizzle-kit/bin.cjs',
        'migrate',
        '--config',
        'drizzle-mysql.config.ts',
      ]);
      expect(result.exitCode, result.output).toBe(0);
    }
    const result = await app.exec([
      'node',
      '-e',
      `const mysql = require('mysql2/promise');
       (async () => {
         const connection = await mysql.createConnection({
           host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER,
           password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
         });
         try {
           const [rows] = await connection.query('SELECT name FROM demos');
           const [migrations] = await connection.query('SELECT COUNT(*) AS count FROM __drizzle_migrations');
           console.log(JSON.stringify({ rows, migrations }));
         } finally { await connection.end(); }
       })().catch(error => { console.error(error); process.exitCode = 1; });`,
    ]);
    expect(result.exitCode, result.output).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      rows: [{ name: 'demos0' }],
      migrations: [{ count: 2 }],
    });
  });

  it.each(['/demo', '/admin/demo', '/queues'])(
    '给定生产环境，请求 %s 应隐藏示例和管理入口并返回统一错误',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        signal: AbortSignal.timeout(5_000),
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('x-request-id')).toBeTruthy();
      expect(await response.json()).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: `Cannot GET ${path}`,
      });
    },
  );

  it.each([
    [allowedOrigin, allowedOrigin],
    ['https://untrusted.example.test', null],
  ])('给定来源 %s，跨域预检应仅放行白名单', async (origin, expectedOrigin) => {
    const response = await fetch(`${baseUrl}/demo`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
      },
      signal: AbortSignal.timeout(5_000),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      expectedOrigin,
    );
    if (expectedOrigin) {
      expect(response.headers.get('access-control-allow-credentials')).toBe(
        'true',
      );
    }
  });

  it.each(['', '*'])(
    '给定不安全的生产跨域配置 %j，新进程应拒绝启动',
    async (origin) => {
      const result = await app.exec(['timeout', '20', 'node', 'dist/main'], {
        env: { APP_CORS_DOMAINS: origin, APP_PORT: '3001' },
      });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain('APP_CORS_MANAGED_BY_PROXY=true');
      expect(result.output).not.toContain(
        'Nest application successfully started',
      );
    },
  );

  // 必须最后执行：真实信号发给镜像 PID 1，而不是直接调用内部生命周期方法。
  it('给定已启动的生产应用，收到 SIGTERM 后应释放连接并正常退出', async () => {
    await docker(['kill', '--signal=SIGTERM', app.getId()]);
    const { stdout } = await docker(['wait', app.getId()], 15_000);
    expect(stdout.trim()).toBe('0');
    const logs = await appLogs();
    expect(logs).toContain('收到信号 SIGTERM');
    expect(logs).toContain('数据库连接已关闭');
    expect(logs.match(/Redis 连接已平滑关闭/g)).toHaveLength(2);
    expect(logs).toContain('资源已释放，进程正常退出');
    expect(logs).not.toContain('强制退出');
  });
});
