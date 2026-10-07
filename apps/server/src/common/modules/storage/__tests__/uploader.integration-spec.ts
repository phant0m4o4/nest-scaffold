import { StorageService } from '../storage.service';
import storageConfig, {
  type StorageConfigType,
} from '@/configs/storage.config';
import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StorageModule } from '../storage.module';
import { UploaderService } from '../uploader.service';

const S3_PORT = 8333;
const BUCKET = `uploader-test-${randomUUID()}`;
const ACCESS_KEY_ID = 'uploader-integration-access';
const SECRET_ACCESS_KEY = 'uploader-integration-secret';
const CONTENT_TYPE = 'application/octet-stream';
const BROWSER_ORIGIN = 'https://uploader.integration.test';
const CONSUMER = Symbol('storage-consumer');

describe('Uploader 与真实 SeaweedFS 直传', { concurrent: false }, () => {
  let container: StartedTestContainer | undefined;
  let module: TestingModule | undefined;
  let admin: S3Client | undefined;
  let uploader: UploaderService;
  let storage: StorageService;

  async function put(
    ticket: { url: string; headers: Record<string, string> },
    body: Buffer<ArrayBuffer>,
    headers: HeadersInit = ticket.headers,
  ): Promise<Response> {
    // 只请求本套件签发的临时容器地址；禁止重定向到测试边界外。
    return fetch(ticket.url, {
      method: 'PUT',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function expectStatus(
    response: Response,
    status: number,
  ): Promise<void> {
    const responseBody = await response.text();
    expect(response.status, responseBody).toBe(status);
  }

  beforeAll(async () => {
    // 全部资源和测试凭据由本套件创建，不读取 .env 或外部 Storage 配置。
    container = await new GenericContainer('chrislusf/seaweedfs:4.47')
      .withCommand([
        'mini',
        '-dir=/data',
        '-webdav=false',
        '-admin.ui=false',
        '-s3.port.iceberg=0',
        '-s3.port.lance=0',
      ])
      .withEnvironment({
        AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
      })
      .withExposedPorts(S3_PORT)
      .withStartupTimeout(120_000)
      .start();
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(S3_PORT)}`;
    const configuration: StorageConfigType = {
      endpoint,
      publicEndpoint: endpoint,
      region: 'us-east-1',
      bucket: BUCKET,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      sessionToken: undefined,
      forcePathStyle: true,
      maxUploadBytes: 1024 * 1024,
      maxBufferBytes: 1024 * 1024,
      uploadTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
      maxConcurrentUploads: 2,
      presignExpiresInSeconds: 300,
    };
    admin = new S3Client({
      endpoint,
      region: configuration.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 10_000 },
    });
    await vi.waitFor(
      async () => {
        await admin!.send(new CreateBucketCommand({ Bucket: BUCKET }));
      },
      { timeout: 30_000, interval: 200 },
    );
    await admin.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [BROWSER_ORIGIN],
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['content-type', 'if-none-match'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 300,
            },
          ],
        },
      }),
    );
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, ignoreEnvVars: true }),
        StorageModule,
      ],
      // 从业务模块视角注入两个导出服务，防止只在内部注册而漏掉 exports。
      providers: [
        {
          provide: CONSUMER,
          inject: [StorageService, UploaderService],
          useFactory: (storage: StorageService, uploader: UploaderService) => ({
            storage,
            uploader,
          }),
        },
      ],
    })
      .overrideProvider(storageConfig.KEY)
      .useValue(configuration)
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ storage: configuration }))
      .compile();
    await module.init();
    uploader = module.get(UploaderService);
    storage = module.get(StorageService);
  }, 180_000);

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      admin?.destroy();
      // bucket、对象和 CORS 配置均属于本套件；仅销毁自己创建的容器。
      await container?.stop();
    }
  }, 120_000);

  it('只导入 StorageModule 即可在业务侧注入两个服务', () => {
    const consumer = module!.get<{
      storage: StorageService;
      uploader: UploaderService;
    }>(CONSUMER);
    expect(consumer.storage).toBe(storage);
    expect(consumer.uploader).toBe(uploader);
  });

  it('应签发限时票据，直传后核验真实对象并读取内容', async () => {
    const body = Buffer.from('Uploader 集成测试：浏览器直接写入临时 S3。');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
      prefix: `users/${randomUUID()}`,
    });
    const headers = new Headers(ticket.headers);
    expect(ticket.method).toBe('PUT');
    expect(ticket.contentLength).toBe(body.length);
    expect(headers.get('content-type')).toBe(CONTENT_TYPE);
    expect(headers.get('if-none-match')).toBe('*');
    // 浏览器禁止手动设置 Content-Length，但上传 Buffer / File 时会自动发送。
    expect(headers.has('content-length')).toBe(false);
    const signedHeaders = new URL(ticket.url).searchParams
      .get('X-Amz-SignedHeaders')!
      .split(';');
    expect(signedHeaders).toEqual(
      expect.arrayContaining([
        'content-length',
        'content-type',
        'host',
        'if-none-match',
      ]),
    );
    expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(Date.now());

    await expectStatus(await put(ticket, body), 200);

    await expect(
      uploader.verifyUpload({
        key: ticket.key,
        contentType: CONTENT_TYPE,
        contentLength: body.length,
      }),
    ).resolves.toMatchObject({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });
    await expect(storage.readBuffer(ticket.key)).resolves.toEqual(body);
  });

  it('重复使用链接应返回 412，不能覆盖已上传对象', async () => {
    const body = Buffer.from('original');
    const replacement = Buffer.from('replaced');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });

    await expectStatus(await put(ticket, body), 200);
    await expectStatus(await put(ticket, replacement), 412);

    await expect(storage.readBuffer(ticket.key)).resolves.toEqual(body);
  });

  it.each([0, 17])(
    '应允许原始 File 请求体并自动匹配 %s 字节长度',
    async (size) => {
      const file = new File([new Uint8Array(size)], 'upload.txt', {
        type: 'text/plain',
      });
      const ticket = await uploader.createUpload({
        contentType: file.type,
        contentLength: file.size,
      });
      const response = await fetch(ticket.url, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      await expectStatus(response, 200);
      await expect(
        uploader.verifyUpload({
          key: ticket.key,
          contentType: file.type,
          contentLength: file.size,
        }),
      ).resolves.toMatchObject({ contentLength: size, contentType: file.type });
    },
  );

  it('并发使用同一个链接应只有一个请求成功，其余不能覆盖', async () => {
    const bodies = Array.from({ length: 4 }, (_, index) =>
      Buffer.alloc(256 * 1024, index + 1),
    );
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: bodies[0].length,
    });

    const responses = await Promise.all(
      bodies.map((body) => put(ticket, body)),
    );
    const statuses = responses.map((response) => response.status);
    await Promise.all(responses.map((response) => response.arrayBuffer()));

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(
      statuses
        .filter((status) => status !== 200)
        .every((status) => [409, 412].includes(status)),
    ).toBe(true);
    await expect(storage.readBuffer(ticket.key)).resolves.toEqual(
      bodies[statuses.indexOf(200)],
    );
  });

  it.each([
    ['if-none-match', undefined],
    ['if-none-match', 'not-the-signed-condition'],
    ['content-type', undefined],
    ['content-type', 'text/plain'],
  ] as const)('删除或修改签名请求头 %s=%s 应被拒绝', async (name, value) => {
    const body = Buffer.from('signed-header');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });
    const headers = new Headers(ticket.headers);
    if (value === undefined) headers.delete(name);
    else headers.set(name, value);

    await expectStatus(await put(ticket, body, headers), 403);

    await expect(storage.head(ticket.key)).resolves.toBeNull();
  });

  it('实际正文长度与签发长度不符时应因签名不匹配而拒绝', async () => {
    const body = Buffer.from('expected-length');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });

    await expectStatus(await put(ticket, Buffer.concat([body, body])), 403);

    await expect(storage.head(ticket.key)).resolves.toBeNull();
  });

  it.each(['key', 'signature'] as const)(
    '修改 URL 中的 %s 应被拒绝且不能创建对象',
    async (field) => {
      const body = Buffer.from('signed-url');
      const ticket = await uploader.createUpload({
        contentType: CONTENT_TYPE,
        contentLength: body.length,
      });
      const url = new URL(ticket.url);
      const alteredKey = `${ticket.key}-altered`;
      if (field === 'key') url.pathname += '-altered';
      else url.searchParams.set('X-Amz-Signature', '0'.repeat(64));

      await expectStatus(await put({ ...ticket, url: url.href }, body), 403);

      await expect(storage.head(ticket.key)).resolves.toBeNull();
      await expect(storage.head(alteredKey)).resolves.toBeNull();
    },
  );

  it('真实过期的链接应被拒绝且不创建对象', async () => {
    const body = Buffer.from('expired-link');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
      expiresInSeconds: 1,
    });
    // 不 mock 时间：让真实 S3 服务依据签名时间检查失效边界。
    await setTimeout(2_100);

    await expectStatus(await put(ticket, body), 403);

    await expect(storage.head(ticket.key)).resolves.toBeNull();
  });

  it('临时 bucket 的 CORS 应允许指定来源预检及条件直传', async () => {
    const body = Buffer.from('browser-upload');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });
    const preflight = await fetch(ticket.url, {
      method: 'OPTIONS',
      headers: {
        Origin: BROWSER_ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,if-none-match',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    await preflight.arrayBuffer();
    expect(preflight.ok).toBe(true);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      BROWSER_ORIGIN,
    );
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    );
    const allowedHeaders = preflight.headers
      .get('access-control-allow-headers')!
      .toLowerCase()
      .split(',')
      .map((value) => value.trim());
    expect(allowedHeaders).toEqual(
      expect.arrayContaining(['content-type', 'if-none-match']),
    );

    const headers = new Headers(ticket.headers);
    headers.set('Origin', BROWSER_ORIGIN);
    const uploaded = await put(ticket, body, headers);
    expect(uploaded.headers.get('access-control-allow-origin')).toBe(
      BROWSER_ORIGIN,
    );
    await expectStatus(uploaded, 200);
  });

  it('核验应拒绝尚未上传、大小不符或类型不符的对象', async () => {
    const body = Buffer.from('verify-upload');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });
    const expected = {
      key: ticket.key,
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    };
    await expect(uploader.verifyUpload(expected)).rejects.toThrow();
    await expectStatus(await put(ticket, body), 200);

    await expect(
      uploader.verifyUpload({ ...expected, contentLength: body.length + 1 }),
    ).rejects.toThrow();
    await expect(
      uploader.verifyUpload({ ...expected, contentType: 'text/plain' }),
    ).rejects.toThrow();

    await expect(storage.readBuffer(ticket.key)).resolves.toEqual(body);
  });

  it('对象被删除后，未到期的链接可以再次上传而非严格一次性', async () => {
    const body = Buffer.from('before-delete');
    const replacement = Buffer.from('after-deleted');
    const ticket = await uploader.createUpload({
      contentType: CONTENT_TYPE,
      contentLength: body.length,
    });
    await expectStatus(await put(ticket, body), 200);

    await storage.delete(ticket.key);
    await expectStatus(await put(ticket, replacement), 200);

    await expect(storage.readBuffer(ticket.key)).resolves.toEqual(replacement);
  });
});
