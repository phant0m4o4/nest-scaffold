import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import storageConfig from '../storage.config';

const TEST_ENVIRONMENT: Record<string, string | undefined> = {
  NODE_ENV: 'test',
  STORAGE_S3_ENDPOINT: 'http://127.0.0.1:9000',
  STORAGE_S3_PUBLIC_ENDPOINT: undefined,
  STORAGE_S3_REGION: undefined,
  STORAGE_S3_BUCKET: 'storage-unit-tests',
  STORAGE_S3_ACCESS_KEY_ID: 'unit-test-access-key',
  STORAGE_S3_SECRET_ACCESS_KEY: 'unit-test-secret-key',
  STORAGE_S3_SESSION_TOKEN: undefined,
  STORAGE_S3_FORCE_PATH_STYLE: undefined,
  STORAGE_MAX_UPLOAD_BYTES: undefined,
  STORAGE_MAX_BUFFER_BYTES: undefined,
  STORAGE_UPLOAD_TIMEOUT_MS: undefined,
  STORAGE_REQUEST_TIMEOUT_MS: undefined,
  STORAGE_MAX_CONCURRENT_UPLOADS: undefined,
  STORAGE_PRESIGN_EXPIRES_SECONDS: undefined,
};

describe('Storage 配置', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(TEST_ENVIRONMENT)) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('应使用显式存储凭据和有界默认值', () => {
    expect(storageConfig()).toEqual({
      endpoint: 'http://127.0.0.1:9000',
      publicEndpoint: undefined,
      region: 'us-east-1',
      bucket: 'storage-unit-tests',
      accessKeyId: 'unit-test-access-key',
      secretAccessKey: 'unit-test-secret-key',
      sessionToken: undefined,
      forcePathStyle: false,
      maxUploadBytes: 104857600,
      maxBufferBytes: 5242880,
      uploadTimeoutMs: 120000,
      requestTimeoutMs: 30000,
      maxConcurrentUploads: 4,
      presignExpiresInSeconds: 300,
    });
  });

  it('应解析自定义连接参数、临时凭据和资源限制', () => {
    const overrides = {
      STORAGE_S3_ENDPOINT: 'https://objects.example.invalid',
      STORAGE_S3_PUBLIC_ENDPOINT: 'https://uploads.example.invalid',
      STORAGE_S3_REGION: 'test-region-1',
      STORAGE_S3_SESSION_TOKEN: 'unit-test-session-token',
      STORAGE_S3_FORCE_PATH_STYLE: 'true',
      STORAGE_MAX_UPLOAD_BYTES: '1024',
      STORAGE_MAX_BUFFER_BYTES: '512',
      STORAGE_UPLOAD_TIMEOUT_MS: '1000',
      STORAGE_REQUEST_TIMEOUT_MS: '500',
      STORAGE_MAX_CONCURRENT_UPLOADS: '2',
      STORAGE_PRESIGN_EXPIRES_SECONDS: '90',
    };
    for (const [key, value] of Object.entries(overrides)) {
      vi.stubEnv(key, value);
    }

    expect(storageConfig()).toMatchObject({
      endpoint: 'https://objects.example.invalid',
      publicEndpoint: 'https://uploads.example.invalid',
      region: 'test-region-1',
      sessionToken: 'unit-test-session-token',
      forcePathStyle: true,
      maxUploadBytes: 1024,
      maxBufferBytes: 512,
      uploadTimeoutMs: 1000,
      requestTimeoutMs: 500,
      maxConcurrentUploads: 2,
      presignExpiresInSeconds: 90,
    });
  });

  it.each([
    'STORAGE_S3_ENDPOINT',
    'STORAGE_S3_BUCKET',
    'STORAGE_S3_ACCESS_KEY_ID',
    'STORAGE_S3_SECRET_ACCESS_KEY',
  ])('缺失必填变量 %s 时应拒绝配置', (key) => {
    vi.stubEnv(key, undefined);

    expect(() => storageConfig()).toThrow(key);
  });

  it.each([
    'objects.example.invalid',
    'ftp://objects.example.invalid',
    'https://user:password@objects.example.invalid',
    'https://objects.example.invalid?token=secret',
    'https://objects.example.invalid#fragment',
  ])('应拒绝无效或包含敏感 URL 信息的 endpoint：%s', (endpoint) => {
    vi.stubEnv('STORAGE_S3_ENDPOINT', endpoint);

    expect(() => storageConfig()).toThrow(/STORAGE_S3_ENDPOINT/);
  });

  it('生产环境应拒绝 HTTP endpoint', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => storageConfig()).toThrow(/STORAGE_S3_ENDPOINT/);
  });

  it('生产环境应接受 HTTPS endpoint', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORAGE_S3_ENDPOINT', 'https://objects.example.invalid');

    expect(storageConfig().endpoint).toBe('https://objects.example.invalid');
  });

  it.each([
    '',
    'uploads.example.invalid',
    'ftp://uploads.example.invalid',
    'https://user:password@uploads.example.invalid',
    'https://uploads.example.invalid/path',
    'https://uploads.example.invalid?token=secret',
    'https://uploads.example.invalid#fragment',
  ])('应拒绝不合法的公开签名地址：%s', (publicEndpoint) => {
    vi.stubEnv('STORAGE_S3_PUBLIC_ENDPOINT', publicEndpoint);

    expect(() => storageConfig()).toThrow(/STORAGE_S3_PUBLIC_ENDPOINT/);
  });

  it('测试环境可显式使用本地 HTTP 公开地址', () => {
    vi.stubEnv('STORAGE_S3_PUBLIC_ENDPOINT', 'http://127.0.0.1:9001');

    expect(storageConfig().publicEndpoint).toBe('http://127.0.0.1:9001');
  });

  it('生产环境应单独拒绝 HTTP 公开地址', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORAGE_S3_ENDPOINT', 'https://objects.example.invalid');
    vi.stubEnv('STORAGE_S3_PUBLIC_ENDPOINT', 'http://uploads.example.invalid');

    expect(() => storageConfig()).toThrow(/STORAGE_S3_PUBLIC_ENDPOINT/);
  });

  it('生产环境应接受独立的 HTTPS 公开地址', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STORAGE_S3_ENDPOINT', 'https://objects.example.invalid');
    vi.stubEnv('STORAGE_S3_PUBLIC_ENDPOINT', 'https://uploads.example.invalid');

    expect(storageConfig().publicEndpoint).toBe(
      'https://uploads.example.invalid',
    );
  });

  it.each(['1', '900'])('应接受预签名有效期边界 %s 秒', (value) => {
    vi.stubEnv('STORAGE_PRESIGN_EXPIRES_SECONDS', value);

    expect(storageConfig().presignExpiresInSeconds).toBe(Number(value));
  });

  it('预签名有效期不能超过 900 秒', () => {
    vi.stubEnv('STORAGE_PRESIGN_EXPIRES_SECONDS', '901');

    expect(() => storageConfig()).toThrow(/STORAGE_PRESIGN_EXPIRES_SECONDS/);
  });

  it.each([
    '',
    'ab',
    'UPPER-case',
    'bucket_with_underscore',
    '-leading',
    'trailing-',
    'two..dots',
    '192.168.0.1',
    'a'.repeat(64),
  ])('应拒绝非法 bucket 名称：%s', (bucket) => {
    vi.stubEnv('STORAGE_S3_BUCKET', bucket);

    expect(() => storageConfig()).toThrow(/STORAGE_S3_BUCKET/);
  });

  it.each(['1', '0', 'yes', 'false-ish'])('应拒绝模糊布尔值：%s', (value) => {
    vi.stubEnv('STORAGE_S3_FORCE_PATH_STYLE', value);

    expect(() => storageConfig()).toThrow(/STORAGE_S3_FORCE_PATH_STYLE/);
  });

  it('显式 false 不应被当作 truthy 字符串', () => {
    vi.stubEnv('STORAGE_S3_FORCE_PATH_STYLE', 'false');

    expect(storageConfig().forcePathStyle).toBe(false);
  });

  describe.each([
    'STORAGE_MAX_UPLOAD_BYTES',
    'STORAGE_MAX_BUFFER_BYTES',
    'STORAGE_UPLOAD_TIMEOUT_MS',
    'STORAGE_REQUEST_TIMEOUT_MS',
    'STORAGE_MAX_CONCURRENT_UPLOADS',
    'STORAGE_PRESIGN_EXPIRES_SECONDS',
  ])('%s 的正安全整数约束', (key) => {
    it.each(['0', '-1', '1.5', 'NaN', '9007199254740992'])(
      '应拒绝 %s',
      (value) => {
        vi.stubEnv(key, value);

        expect(() => storageConfig()).toThrow(key);
      },
    );
  });
});
