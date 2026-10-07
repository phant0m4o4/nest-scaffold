import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

describe('管理后台生产镜像', () => {
  const suppliedImage = process.env.E2E_ADMIN_IMAGE;
  const image = suppliedImage ?? `nest-scaffold-admin-e2e:${randomUUID()}`;
  let builtImage = false;
  let network: StartedNetwork | undefined;
  let backend: StartedTestContainer | undefined;
  let frontend: StartedTestContainer | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    if (!suppliedImage) {
      await execFileAsync(
        'docker',
        [
          'build',
          '--file',
          '../admin-frontend/Dockerfile',
          '--tag',
          image,
          '../..',
        ],
        { timeout: 480_000, maxBuffer: 16 * 1024 * 1024 },
      );
      builtImage = true;
    }
    network = await new Network().start();
    // 仅验证静态站点部署与代理边界；后端替身没有数据库或外部接口。
    backend = await new GenericContainer('node:24-alpine')
      .withNetwork(network)
      .withNetworkAliases('api')
      .withCommand([
        'node',
        '-e',
        `require('node:http').createServer((req, res) => {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({url: req.url}));
        }).listen(3000, '0.0.0.0', () => console.log('fixture-ready'));`,
      ])
      .withWaitStrategy(Wait.forLogMessage('fixture-ready'))
      .start();
    frontend = await new GenericContainer(image)
      .withNetwork(network)
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp('/', 8080).forStatusCode(200))
      .start();
    baseUrl = `http://${frontend.getHost()}:${frontend.getMappedPort(8080)}`;
  }, 600_000);

  afterAll(async () => {
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(
      [frontend, backend]
        .filter((container) => container !== undefined)
        .map((container) => container.stop()),
    );
    results.push(
      ...(await Promise.allSettled([
        ...(network ? [network.stop()] : []),
        ...(builtImage
          ? [execFileAsync('docker', ['image', 'rm', image])]
          : []),
      ])),
    );
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (errors.length)
      throw new AggregateError(errors, '管理后台临时资源清理失败');
  });

  it('以非 root 运行并支持 SPA 深链接与静态资源缓存', async () => {
    const user = await frontend!.exec(['id', '-u']);
    expect(user.exitCode).toBe(0);
    expect(user.stdout.trim()).not.toBe('0');
    const home = await fetch(baseUrl);
    const html = await home.text();
    expect(home.status).toBe(200);
    expect(home.headers.get('cache-control')).toContain('no-cache');
    const deepLink = await fetch(`${baseUrl}/demos`);
    expect(await deepLink.text()).toBe(html);
    const assetPath = /src="([^"\s]+\.js)"/.exec(html)?.[1];
    expect(assetPath).toBeTruthy();
    const asset = await fetch(new URL(assetPath!, baseUrl));
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${baseUrl}/assets/missing.js`)).status).toBe(404);
  });

  it('将 /api 前缀移除后转发路径和查询参数', async () => {
    const response = await fetch(`${baseUrl}/api/demo/by-page?page=2`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: '/demo/by-page?page=2' });
  });
});
