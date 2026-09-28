import storageConfig, {
  type StorageConfigType,
} from '@/configs/storage.config';
import {
  CreateBucketCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StorageModule } from '../storage.module';
import { StorageService } from '../storage.service';

const S3_PORT = 8333;
const MIB = 1024 * 1024;
const BUCKET = `storage-test-${randomUUID()}`;
const ACCESS_KEY_ID = 'storage-integration-access';
const SECRET_ACCESS_KEY = 'storage-integration-secret';

describe('Storage 与真实 SeaweedFS S3', { concurrent: false }, () => {
  let container: StartedTestContainer | undefined;
  let module: TestingModule | undefined;
  let admin: S3Client | undefined;
  let configuration: StorageConfigType;
  let storage: StorageService;

  async function createModule(
    config: StorageConfigType,
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, ignoreEnvVars: true }),
        StorageModule,
      ],
    })
      .overrideProvider(storageConfig.KEY)
      .useValue(config)
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ storage: config }))
      .compile();
  }

  async function multipartUploads(key: string) {
    const response = await admin!.send(
      new ListMultipartUploadsCommand({ Bucket: BUCKET, Prefix: key }),
    );
    return (response.Uploads ?? []).filter((upload) => upload.Key === key);
  }

  async function waitForFirstPart(key: string): Promise<void> {
    // 确认真实分段已落到本次临时服务，再触发中断，避免只覆盖请求发送前的失败。
    await vi.waitFor(
      async () => {
        const uploads = await multipartUploads(key);
        expect(uploads).toHaveLength(1);
        expect(uploads[0].UploadId).toBeTruthy();
        const result = await admin!.send(
          new ListPartsCommand({
            Bucket: BUCKET,
            Key: key,
            UploadId: uploads[0].UploadId!,
          }),
        );
        expect(result.Parts?.length).toBeGreaterThan(0);
      },
      { timeout: 20_000, interval: 100 },
    );
  }

  async function expectUploadRemoved(key: string): Promise<void> {
    await expect(storage.head(key)).resolves.toBeNull();
    await vi.waitFor(
      async () => {
        expect(await multipartUploads(key)).toEqual([]);
      },
      { timeout: 10_000, interval: 100 },
    );
  }

  beforeAll(async () => {
    // 地址和凭据只能来自本套件；不加载 .env，也不读取任何外部 Storage 配置。
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
    configuration = {
      endpoint: `http://${container.getHost()}:${container.getMappedPort(S3_PORT)}`,
      publicEndpoint: undefined,
      region: 'us-east-1',
      bucket: BUCKET,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      sessionToken: undefined,
      forcePathStyle: true,
      maxUploadBytes: 8 * MIB,
      maxBufferBytes: 5 * MIB,
      uploadTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
      maxConcurrentUploads: 2,
      presignExpiresInSeconds: 300,
    };
    admin = new S3Client({
      endpoint: configuration.endpoint,
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
    module = await createModule(configuration);
    await module.init();
    storage = module.get(StorageService);
  }, 180_000);

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      admin?.destroy();
      // 对象及未完成分段均属于该临时容器，停容器即可清理，不执行全局清理。
      await container?.stop();
    }
  }, 120_000);

  it('应通过 Nest 模块上传、读取元数据、流式下载并删除小对象', async () => {
    const key = `small/${randomUUID()}.txt`;
    const payload = Buffer.from('Storage 集成测试：只写入临时 S3 服务。');
    const contentType = 'text/plain; charset=utf-8';
    const metadata = { scenario: 'small-object', source: 'integration-test' };

    const uploaded = await storage.put(key, payload, {
      contentType,
      metadata,
    });
    expect(uploaded.key).toBe(key);
    expect(typeof uploaded.etag).toBe('string');
    await expect(storage.head(key)).resolves.toMatchObject({
      contentLength: payload.length,
      contentType,
      metadata,
      etag: uploaded.etag,
    });
    const downloaded = await storage.get(key);
    expect(downloaded.body).toBeInstanceOf(Readable);
    expect(downloaded).toMatchObject({
      contentLength: payload.length,
      contentType,
      metadata,
      etag: uploaded.etag,
    });
    expect(await buffer(downloaded.body)).toEqual(payload);
    await expect(storage.readBuffer(key)).resolves.toEqual(payload);

    await storage.delete(key);
    await expect(storage.head(key)).resolves.toBeNull();
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it.each([
    ['string', '字符串正文'],
    ['Uint8Array', new Uint8Array([0, 1, 127, 128, 255])],
  ] as const)('应直接上传 %s 正文', async (_name, body) => {
    const key = `body-types/${randomUUID()}`;

    await storage.put(key, body);

    const expected =
      typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    await expect(storage.readBuffer(key)).resolves.toEqual(expected);
  });

  it('超过 5 MiB 的流应完成真实分段上传并保持完整内容', async () => {
    const key = `multipart/${randomUUID()}`;
    const payload = Buffer.alloc(6 * MIB + 137, 0xa5);
    payload.write('multipart-start');
    payload.write('multipart-end', payload.length - 13);
    const source = Readable.from(
      (function* () {
        for (let offset = 0; offset < payload.length; offset += 64 * 1024) {
          yield payload.subarray(offset, offset + 64 * 1024);
        }
      })(),
    );

    const uploaded = await storage.put(key, source, {
      contentType: 'application/octet-stream',
    });

    expect(uploaded.etag).toMatch(/-2"?$/);
    await expect(storage.head(key)).resolves.toMatchObject({
      contentLength: payload.length,
      contentType: 'application/octet-stream',
    });
    const downloaded = await storage.get(key);
    const digest = createHash('sha256');
    let received = 0;
    for await (const chunk of downloaded.body) {
      const bytes = chunk as Buffer;
      received += bytes.length;
      digest.update(bytes);
    }
    expect(received).toBe(payload.length);
    expect(digest.digest('hex')).toBe(
      createHash('sha256').update(payload).digest('hex'),
    );
    await expect(storage.readBuffer(key)).rejects.toThrow();
    expect(await multipartUploads(key)).toEqual([]);
  });

  it('404 应使 head 返回 null，下载仍保留不存在错误', async () => {
    const key = `missing/${randomUUID()}`;

    await expect(storage.head(key)).resolves.toBeNull();
    await expect(storage.get(key)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    await expect(storage.readBuffer(key)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
  });

  it('鉴权失败不能被当成对象不存在', async () => {
    const rejectedModule = await createModule({
      ...configuration,
      secretAccessKey: 'incorrect-integration-secret',
    });
    try {
      await rejectedModule.init();
      await expect(
        rejectedModule.get(StorageService).head(`forbidden/${randomUUID()}`),
      ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
    } finally {
      await rejectedModule.close();
    }
  });

  it('readBuffer 的单次限制应拒绝超限对象且不影响后续读取', async () => {
    const key = `buffer-limit/${randomUUID()}`;
    const payload = Buffer.alloc(2048, 0x31);
    await storage.put(key, payload);

    await expect(storage.readBuffer(key, { maxBytes: 1024 })).rejects.toThrow();
    await expect(storage.readBuffer(key, { maxBytes: 2048 })).resolves.toEqual(
      payload,
    );
  });

  it.each(['Buffer', 'Readable'])(
    '上传超限 %s 时不应留下完整对象或未完成分段',
    async (kind) => {
      const key = `upload-limit/${kind}/${randomUUID()}`;
      const payload = Buffer.alloc(configuration.maxUploadBytes + 1, 0x42);
      const body = kind === 'Buffer' ? payload : Readable.from([payload]);

      await expect(storage.put(key, body)).rejects.toThrow();

      if (body instanceof Readable) expect(body.destroyed).toBe(true);
      await expectUploadRemoved(key);
    },
  );

  it.each(['source-error', 'abort'])(
    '首个分段写入后发生 %s，应终止上传并清理远端分段',
    async (scenario) => {
      const key = `interrupted/${scenario}/${randomUUID()}`;
      const source = new PassThrough();
      const controller = new AbortController();
      const sourceError = new Error('测试来源流失败');
      const upload = storage.put(key, source, {
        abortSignal: controller.signal,
      });
      // 立即处理拒绝，等待远端状态期间也不会产生未处理的 Promise 拒绝。
      const settled = upload.catch((error: unknown) => error);
      try {
        source.write(Buffer.alloc(6 * MIB, 0x63));
        await waitForFirstPart(key);
        if (scenario === 'source-error') source.destroy(sourceError);
        else controller.abort();

        await expect(upload).rejects.toThrow();
        expect(source.destroyed).toBe(true);
        await expectUploadRemoved(key);
      } finally {
        controller.abort();
        source.destroy();
        await settled;
      }
    },
  );
});
