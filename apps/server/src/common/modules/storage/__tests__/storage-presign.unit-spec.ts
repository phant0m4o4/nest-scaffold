import type { StorageConfigType } from '@/configs/storage.config';
import { S3Client } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageService } from '../storage.service';

const SIGNING_TIME = new Date('2030-01-02T03:04:05.987Z').getTime();
const MAX_SINGLE_PUT_BYTES = 5 * 1024 ** 3;
const TEST_CONFIG: StorageConfigType = {
  endpoint: 'https://internal.example.invalid',
  publicEndpoint: 'https://uploads.example.invalid:9443',
  region: 'us-east-1',
  bucket: 'storage-presign-tests',
  accessKeyId: 'explicit-test-access-key',
  secretAccessKey: 'explicit-test-secret-key',
  sessionToken: 'explicit-test-session-token',
  forcePathStyle: true,
  maxUploadBytes: 1024,
  maxBufferBytes: 16,
  uploadTimeoutMs: 1000,
  requestTimeoutMs: 1000,
  maxConcurrentUploads: 2,
  presignExpiresInSeconds: 300,
};
const PUT_OPTIONS = { contentType: 'image/png', contentLength: 12 };

describe('StorageService 预签名上传', () => {
  const services: StorageService[] = [];

  function buildService(
    overrides: Partial<StorageConfigType> = {},
  ): StorageService {
    const configService = {
      getOrThrow: vi.fn().mockReturnValue({ ...TEST_CONFIG, ...overrides }),
    } as unknown as ConfigService;
    const service = new StorageService(configService);
    services.push(service);
    return service;
  }

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(SIGNING_TIME);
    // 使用真实离线签名，任何 send 调用都立即失败，不能意外发起真实请求。
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(() => {
      throw new Error('预签名单测禁止真实发送 S3 请求');
    });
    vi.spyOn(S3Client.prototype, 'destroy');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'unused-environment-access-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'unused-environment-secret-key');
    vi.stubEnv('AWS_SESSION_TOKEN', 'unused-environment-session-token');
    vi.stubEnv('AWS_REGION', 'unused-region-1');
    vi.stubEnv('AWS_EC2_METADATA_DISABLED', 'true');
  });

  afterEach(async () => {
    try {
      for (const service of services.splice(0)) await service.onModuleDestroy();
      expect(S3Client.prototype.send).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });

  it('应在公开地址签发绑定固定 bucket、对象键和必要请求头的 PUT', async () => {
    const service = buildService();
    const key = 'uploads/测试 image.png';

    const result = await service.presignPut(key, PUT_OPTIONS);
    const url = new URL(result.url);

    expect(url.origin).toBe('https://uploads.example.invalid:9443');
    expect(decodeURIComponent(url.pathname)).toBe(
      `/storage-presign-tests/${key}`,
    );
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual([
      'content-length',
      'content-type',
      'host',
      'if-none-match',
    ]);
    expect(result).toMatchObject({
      key,
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'if-none-match': '*' },
      contentLength: 12,
    });
    // 浏览器自行设置 Content-Length，返回头不能要求前端设置受限请求头。
    expect(result.headers).not.toHaveProperty('content-length');
    expect(url.searchParams.has('x-amz-acl')).toBe(false);
  });

  it('未配置公开地址时应使用服务端 endpoint', async () => {
    const service = buildService({ publicEndpoint: undefined });

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);

    expect(new URL(result.url).origin).toBe(TEST_CONFIG.endpoint);
  });

  it('关闭 path-style 时应保留 SDK 的 bucket 子域寻址', async () => {
    const service = buildService({ forcePathStyle: false });

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);
    const url = new URL(result.url);

    expect(url.hostname).toBe('storage-presign-tests.uploads.example.invalid');
    expect(url.pathname).toBe('/uploads/image.png');
  });

  it('应使用显式凭据签名且不泄露 secret 或回退环境凭据', async () => {
    const service = buildService();

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);
    const url = new URL(result.url);

    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'explicit-test-access-key/20300102/us-east-1/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe(
      'explicit-test-session-token',
    );
    expect(JSON.stringify(result)).not.toContain(TEST_CONFIG.secretAccessKey);
    expect(JSON.stringify(result)).not.toContain('unused-environment');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });

  it('未配置临时凭据时不应从环境继承 session token', async () => {
    const service = buildService({ sessionToken: undefined });

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);

    expect(new URL(result.url).searchParams.has('X-Amz-Security-Token')).toBe(
      false,
    );
  });

  it('默认有效期和返回的过期时间应与 SigV4 的秒精度一致', async () => {
    const service = buildService();

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);
    const url = new URL(result.url);

    expect(url.searchParams.get('X-Amz-Date')).toBe('20300102T030405Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(result.expiresAt).toBe('2030-01-02T03:09:05.000Z');
  });

  it('调用方可以收紧有效期', async () => {
    const service = buildService();

    const result = await service.presignPut('uploads/image.png', {
      ...PUT_OPTIONS,
      expiresInSeconds: 1,
    });

    expect(new URL(result.url).searchParams.get('X-Amz-Expires')).toBe('1');
    expect(result.expiresAt).toBe('2030-01-02T03:04:06.000Z');
  });

  it.each([0, -1, 1.5, 301, Number.NaN, Number.POSITIVE_INFINITY])(
    '应拒绝非法或放宽配置的有效期：%s',
    async (expiresInSeconds) => {
      const service = buildService();

      await expect(
        service.presignPut('uploads/image.png', {
          ...PUT_OPTIONS,
          expiresInSeconds,
        }),
      ).rejects.toThrow(/有效期/);
    },
  );

  it('应接受配置允许的 900 秒绝对上限', async () => {
    const service = buildService({ presignExpiresInSeconds: 900 });

    const result = await service.presignPut('uploads/image.png', PUT_OPTIONS);

    expect(new URL(result.url).searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('服务边界仍应拒绝超过 900 秒的有效期', async () => {
    const service = buildService({ presignExpiresInSeconds: 1000 });

    await expect(
      service.presignPut('uploads/image.png', {
        ...PUT_OPTIONS,
        expiresInSeconds: 901,
      }),
    ).rejects.toThrow(/有效期/);
  });

  it.each([0, TEST_CONFIG.maxUploadBytes])(
    '应接受允许范围内的确切大小：%s 字节',
    async (contentLength) => {
      const service = buildService();

      const result = await service.presignPut('uploads/image.png', {
        ...PUT_OPTIONS,
        contentLength,
      });

      expect(result.contentLength).toBe(contentLength);
      expect(
        new URL(result.url).searchParams.get('X-Amz-SignedHeaders'),
      ).toContain('content-length');
    },
  );

  it.each([
    -1,
    0.5,
    TEST_CONFIG.maxUploadBytes + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('应拒绝非法或超过配置的文件大小：%s', async (contentLength) => {
    const service = buildService();

    await expect(
      service.presignPut('uploads/image.png', {
        ...PUT_OPTIONS,
        contentLength,
      }),
    ).rejects.toThrow(/大小/);
  });

  it('配置更高限额时单个 PUT 仍最多允许 5 GiB', async () => {
    const service = buildService({ maxUploadBytes: MAX_SINGLE_PUT_BYTES + 1 });

    await expect(
      service.presignPut('uploads/large.bin', {
        ...PUT_OPTIONS,
        contentLength: MAX_SINGLE_PUT_BYTES,
      }),
    ).resolves.toMatchObject({ contentLength: MAX_SINGLE_PUT_BYTES });
    await expect(
      service.presignPut('uploads/large.bin', {
        ...PUT_OPTIONS,
        contentLength: MAX_SINGLE_PUT_BYTES + 1,
      }),
    ).rejects.toThrow(/大小/);
  });

  it('正文大小和 MIME 改变时真实签名必须变化', async () => {
    const service = buildService();
    const original = await service.presignPut('uploads/image.png', PUT_OPTIONS);
    const changedSize = await service.presignPut('uploads/image.png', {
      ...PUT_OPTIONS,
      contentLength: 13,
    });
    const changedType = await service.presignPut('uploads/image.png', {
      ...PUT_OPTIONS,
      contentType: 'image/jpeg',
    });
    const signatures = [original, changedSize, changedType].map((result) =>
      new URL(result.url).searchParams.get('X-Amz-Signature'),
    );

    expect(
      signatures.every((signature) => /^[0-9a-f]{64}$/.test(signature ?? '')),
    ).toBe(true);
    expect(new Set(signatures).size).toBe(3);
  });

  it.each([0, 12])(
    '签名不得绑定 SDK 自动计算的空正文 checksum：%s 字节',
    async (contentLength) => {
      const service = buildService();

      const result = await service.presignPut('uploads/image.png', {
        ...PUT_OPTIONS,
        contentLength,
      });
      const url = new URL(result.url);

      expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe(
        'UNSIGNED-PAYLOAD',
      );
      expect(
        [...url.searchParams.keys()].some((key) =>
          key.toLowerCase().includes('checksum'),
        ),
      ).toBe(false);
      expect(
        Object.keys(result.headers).some((key) =>
          key.toLowerCase().includes('checksum'),
        ),
      ).toBe(false);
    },
  );

  it.each([
    'text/plain; charset=utf-8',
    'text/plain; charset="utf-8"',
    'application/vnd.example+json; version=1',
  ])('应原样保留合法 MIME 参数：%s', async (contentType) => {
    const service = buildService();

    const result = await service.presignPut('uploads/file', {
      ...PUT_OPTIONS,
      contentType,
    });

    expect(result.headers['content-type']).toBe(contentType);
  });

  it.each([
    '',
    'text',
    'text/',
    'text/plain; charset=',
    'text/plain; charset="unfinished',
    'text/plain\r\nx-injected: true',
    'text/plain\t',
    'text/plain\u0000',
    'text/plain\u007f',
    'text/plain; name="中文"',
    `text/${'a'.repeat(251)}`,
  ])('应拒绝非法、过长或含控制字符的 MIME：%s', async (contentType) => {
    const service = buildService();

    await expect(
      service.presignPut('uploads/file', { ...PUT_OPTIONS, contentType }),
    ).rejects.toThrow(/类型/);
  });

  it.each([
    '',
    ' ',
    '/leading',
    'trailing/',
    'a//b',
    'a/../b',
    'a/./b',
    'a\\b',
    'a\nb',
    '中'.repeat(342),
  ])('预签名应沿用对象键约束：%s', async (key) => {
    const service = buildService();

    await expect(service.presignPut(key, PUT_OPTIONS)).rejects.toThrow(/key/);
  });

  it('应接受 UTF-8 恰好 1024 字节的对象键', async () => {
    const service = buildService();
    const key = `${'中'.repeat(341)}a`;

    const result = await service.presignPut(key, PUT_OPTIONS);

    expect(decodeURIComponent(new URL(result.url).pathname)).toBe(
      `/storage-presign-tests/${key}`,
    );
  });

  it('多次签名应复用签名客户端，并在服务关闭时释放两个客户端', async () => {
    const service = buildService();
    await service.presignPut('uploads/one.png', PUT_OPTIONS);
    await service.presignPut('uploads/two.png', PUT_OPTIONS);

    await service.onModuleDestroy();

    expect(S3Client.prototype.destroy).toHaveBeenCalledTimes(2);
    await expect(
      service.presignPut('uploads/closed.png', PUT_OPTIONS),
    ).rejects.toThrow(/已关闭/);
  });

  it('没有签名请求时关闭服务应只释放服务端客户端', async () => {
    const service = buildService();

    await service.onModuleDestroy();

    expect(S3Client.prototype.destroy).toHaveBeenCalledOnce();
    await expect(
      service.presignPut('uploads/closed.png', PUT_OPTIONS),
    ).rejects.toThrow(/已关闭/);
    expect(S3Client.prototype.destroy).toHaveBeenCalledOnce();
  });
});
