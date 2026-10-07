import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageService } from '../storage.service';

const { send, destroy } = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
}));

async function consumeBody(
  body: Buffer | Uint8Array | string | Readable,
): Promise<Buffer> {
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<
    Buffer | Uint8Array | string
  >) {
    chunks.push(
      typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk),
    );
  }
  return Buffer.concat(chunks);
}

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn(function () {
      return { send, destroy };
    }),
  };
});

const TEST_CONFIG = {
  endpoint: 'http://127.0.0.1:9000',
  publicEndpoint: undefined,
  region: 'us-east-1',
  bucket: 'storage-unit-tests',
  accessKeyId: 'unit-test-access-key',
  secretAccessKey: 'unit-test-secret-key',
  sessionToken: 'unit-test-session-token',
  forcePathStyle: true,
  maxUploadBytes: 1024,
  maxBufferBytes: 16,
  uploadTimeoutMs: 1000,
  requestTimeoutMs: 1000,
  maxConcurrentUploads: 2,
  presignExpiresInSeconds: 300,
};

describe('StorageService', () => {
  const services: StorageService[] = [];

  function buildService(
    overrides: Partial<typeof TEST_CONFIG> = {},
  ): StorageService {
    const config = {
      getOrThrow: vi.fn().mockReturnValue({ ...TEST_CONFIG, ...overrides }),
    } as unknown as ConfigService;
    const service = new StorageService(config);
    services.push(service);
    expect(config.getOrThrow).toHaveBeenCalledWith('storage');
    return service;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    send.mockReset();
    destroy.mockReset();
    send.mockImplementation((command: unknown) => {
      if (
        command instanceof PutObjectCommand ||
        command instanceof CompleteMultipartUploadCommand
      ) {
        return Promise.resolve({ ETag: '"upload-etag"' });
      }
      if (command instanceof CreateMultipartUploadCommand) {
        return Promise.resolve({ UploadId: 'unit-test-upload' });
      }
      if (command instanceof UploadPartCommand) {
        return Promise.resolve({ ETag: `"part-${command.input.PartNumber}"` });
      }
      if (command instanceof AbortMultipartUploadCommand)
        return Promise.resolve({});
      return Promise.reject(new Error('测试未显式配置 S3 响应'));
    });
  });

  afterEach(async () => {
    for (const service of services.splice(0)) await service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('应仅使用显式配置创建 S3 客户端', () => {
    buildService();

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: TEST_CONFIG.endpoint,
        region: TEST_CONFIG.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: TEST_CONFIG.accessKeyId,
          secretAccessKey: TEST_CONFIG.secretAccessKey,
          sessionToken: TEST_CONFIG.sessionToken,
        },
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['Buffer', (): Buffer => Buffer.from('你好')],
    ['Uint8Array', (): Uint8Array => new Uint8Array(Buffer.from('你好'))],
    ['字符串', (): string => '你好'],
    [
      'Readable',
      (): Readable => Readable.from([Buffer.from('你'), Buffer.from('好')]),
    ],
  ] as const)('应从 %s 上传并返回对象键和 ETag', async (_label, body) => {
    const service = buildService();

    await expect(
      service.put('exports/greeting.txt', body(), {
        contentType: 'text/plain; charset=utf-8',
        metadata: { source: 'unit-test' },
      }),
    ).resolves.toEqual({ key: 'exports/greeting.txt', etag: '"upload-etag"' });
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: TEST_CONFIG.bucket,
      Key: 'exports/greeting.txt',
      Body: Buffer.from('你好'),
      ContentType: 'text/plain; charset=utf-8',
      Metadata: { source: 'unit-test' },
    });
  });

  it.each([
    '',
    '/leading',
    'trailing/',
    'back\\slash',
    'a/../b',
    './a',
    'a/./b',
    'a\u0000b',
    'a\nb',
    '中'.repeat(342),
  ])('无效对象键应在调用 SDK 前拒绝：%s', async (key) => {
    const service = buildService();

    await expect(service.put(key, 'content')).rejects.toThrow();
    await expect(service.get(key)).rejects.toThrow();
    await expect(service.head(key)).rejects.toThrow();
    await expect(service.delete(key)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('应接受 UTF-8 恰好 1024 字节的对象键', async () => {
    const key = '中'.repeat(341) + 'a';
    const service = buildService();

    await expect(service.put(key, 'ok')).resolves.toMatchObject({ key });
  });

  it('大流应按固定大小分片并按顺序完成 multipart 上传', async () => {
    const partSize = 5 * 1024 * 1024;
    const service = buildService({ maxUploadBytes: partSize * 3 });
    const content = Buffer.alloc(partSize + 7, 42);
    const source = Readable.from([
      content.subarray(0, 13),
      content.subarray(13),
    ]);

    await expect(
      service.put('large.bin', source, {
        contentType: 'application/octet-stream',
      }),
    ).resolves.toEqual({ key: 'large.bin', etag: '"upload-etag"' });

    const commands = send.mock.calls.map(([command]) => command as unknown);
    expect(commands[0]).toBeInstanceOf(CreateMultipartUploadCommand);
    expect((commands[0] as CreateMultipartUploadCommand).input).toMatchObject({
      Bucket: TEST_CONFIG.bucket,
      Key: 'large.bin',
      ContentType: 'application/octet-stream',
    });
    const parts = commands.filter(
      (command): command is UploadPartCommand =>
        command instanceof UploadPartCommand,
    );
    expect(parts.map((part) => part.input.PartNumber)).toEqual([1, 2]);
    expect(parts.map((part) => (part.input.Body as Buffer).length)).toEqual([
      partSize,
      7,
    ]);
    expect(
      Buffer.concat(parts.map((part) => part.input.Body as Buffer)).equals(
        content,
      ),
    ).toBe(true);
    for (const part of parts)
      expect(part.input.UploadId).toBe('unit-test-upload');
    const complete = commands.at(-1) as CompleteMultipartUploadCommand;
    expect(complete).toBeInstanceOf(CompleteMultipartUploadCommand);
    expect(complete.input.MultipartUpload?.Parts).toEqual([
      { ETag: '"part-1"', PartNumber: 1 },
      { ETag: '"part-2"', PartNumber: 2 },
    ]);
    for (const [, options] of send.mock.calls) {
      expect(
        (options as { abortSignal: AbortSignal }).abortSignal,
      ).toBeInstanceOf(AbortSignal);
    }
  });

  it('分片失败应清理当前 multipart 上传并保留原始错误', async () => {
    const partSize = 5 * 1024 * 1024;
    const service = buildService({ maxUploadBytes: partSize * 2 });
    const source = Readable.from([Buffer.alloc(partSize + 1)]);
    const uploadError = new Error('分片上传失败');
    send
      .mockResolvedValueOnce({ UploadId: 'unit-test-upload' })
      .mockRejectedValueOnce(uploadError)
      .mockResolvedValueOnce({});

    await expect(service.put('failed.bin', source)).rejects.toBe(uploadError);

    const commands = send.mock.calls.map(([command]) => command as unknown);
    const abort = commands.at(-1) as AbortMultipartUploadCommand;
    expect(abort).toBeInstanceOf(AbortMultipartUploadCommand);
    expect(abort.input).toEqual({
      Bucket: TEST_CONFIG.bucket,
      Key: 'failed.bin',
      UploadId: 'unit-test-upload',
    });
    expect(
      commands.some(
        (command) => command instanceof CompleteMultipartUploadCommand,
      ),
    ).toBe(false);
    expect(source.destroyed).toBe(true);
  });

  it('分片清理等待期间的源流关闭不应覆盖原始上传错误', async () => {
    const partSize = 5 * 1024 * 1024;
    const service = buildService({ maxUploadBytes: partSize * 2 });
    const source = new PassThrough();
    source.end(Buffer.alloc(partSize + 1));
    const uploadError = new Error('需要保留的分片错误');
    send
      .mockResolvedValueOnce({ UploadId: 'unit-test-upload' })
      .mockRejectedValueOnce(uploadError)
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 1)),
      );

    await expect(service.put('failed.bin', source)).rejects.toBe(uploadError);
    expect(source.destroyed).toBe(true);
  });

  it('分片上传和清理都失败时应同时保留两项错误', async () => {
    const partSize = 5 * 1024 * 1024;
    const service = buildService({ maxUploadBytes: partSize * 2 });
    const uploadError = new Error('分片上传失败');
    const cleanupError = new Error('分片清理失败');
    send
      .mockResolvedValueOnce({ UploadId: 'unit-test-upload' })
      .mockRejectedValueOnce(uploadError)
      .mockRejectedValueOnce(cleanupError);

    await expect(
      service.put('failed.bin', Readable.from([Buffer.alloc(partSize + 1)])),
    ).rejects.toMatchObject({ errors: [uploadError, cleanupError] });
  });

  it('已知长度上传超过字节上限应在 SDK 调用前拒绝', async () => {
    const service = buildService({ maxUploadBytes: 5 });

    await expect(service.put('large.txt', '你好')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('未知长度流超过字节上限应失败并关闭源流', async () => {
    const service = buildService({ maxUploadBytes: 5 });
    const source = Readable.from([Buffer.from('abc'), Buffer.from('def')]);

    await expect(service.put('large.txt', source)).rejects.toThrow();
    expect(source.destroyed).toBe(true);
  });

  it('上传源流错误应向上传播并释放源流', async () => {
    const service = buildService();
    const sourceError = new Error('源流读取失败');
    const source = new Readable({
      read() {
        this.destroy(sourceError);
      },
    });

    await expect(service.put('broken.txt', source)).rejects.toThrow(
      '源流读取失败',
    );
    expect(source.destroyed).toBe(true);
  });

  it('SDK 上传失败应保留错误并关闭源流', async () => {
    const service = buildService();
    const source = Readable.from([Buffer.from('content')]);
    const storageError = new Error('对象存储不可用');
    send.mockRejectedValueOnce(storageError);

    await expect(service.put('failed.txt', source)).rejects.toBe(storageError);
    expect(source.destroyed).toBe(true);
  });

  it('上传开始前取消应阻止 SDK 调用', async () => {
    const service = buildService();
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.put('cancelled.txt', 'body', {
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('上传中取消应终止传输并关闭源流', async () => {
    const service = buildService();
    const controller = new AbortController();
    const source = new PassThrough();
    const promise = service.put('cancelled.txt', source, {
      abortSignal: controller.signal,
    });
    const assertion = expect(promise).rejects.toThrow();
    await Promise.resolve();

    controller.abort();

    await assertion;
    expect(source.destroyed).toBe(true);
  });

  it('上传超时应终止传输并关闭源流', async () => {
    vi.useFakeTimers();
    const service = buildService({ uploadTimeoutMs: 50 });
    const source = new PassThrough();
    const promise = service.put('timeout.txt', source);
    const assertion = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(51);

    await assertion;
    expect(source.destroyed).toBe(true);
  });

  it('请求正在发送时取消应传到 SDK 的 abortSignal', async () => {
    const service = buildService();
    const controller = new AbortController();
    send.mockImplementationOnce(
      (_command: unknown, options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener(
            'abort',
            () => reject(new Error('SDK 请求取消')),
            { once: true },
          );
        }),
    );
    const promise = service.put('sending.txt', Buffer.from('content'), {
      abortSignal: controller.signal,
    });
    const assertion = expect(promise).rejects.toThrow();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());

    controller.abort();

    await assertion;
    expect(
      (send.mock.calls[0][1] as { abortSignal: AbortSignal }).abortSignal
        .aborted,
    ).toBe(true);
  });

  it('上传达到并发上限应立即拒绝，结束后应恢复名额', async () => {
    const service = buildService({ maxConcurrentUploads: 1 });
    const controller = new AbortController();
    const source = new PassThrough();
    const first = service.put('active.txt', source, {
      abortSignal: controller.signal,
    });
    const assertion = expect(first).rejects.toThrow();

    await expect(service.put('overflow.txt', 'body')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    controller.abort();
    await assertion;

    await expect(service.put('next.txt', 'body')).resolves.toMatchObject({
      key: 'next.txt',
    });
  });

  it('应返回下载流与元数据并保持响应体为流', async () => {
    const service = buildService();
    const body = Readable.from([Buffer.from('content')]);
    send.mockResolvedValueOnce({
      Body: body,
      ContentLength: 7,
      ContentType: 'text/plain',
      ETag: '"get-etag"',
      Metadata: { source: 'unit-test' },
    });

    const result = await service.get('downloads/file.txt');

    expect(result.body).toBeInstanceOf(Readable);
    expect(result).toMatchObject({
      contentLength: 7,
      contentType: 'text/plain',
      etag: '"get-etag"',
      metadata: { source: 'unit-test' },
    });
    expect(await consumeBody(result.body)).toEqual(Buffer.from('content'));
    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: TEST_CONFIG.bucket,
      Key: 'downloads/file.txt',
    });
  });

  it('readBuffer 应合并有限大小的下载流', async () => {
    const service = buildService();
    send.mockResolvedValueOnce({
      Body: Readable.from(['ab', 'cd']),
      ContentLength: 4,
    });

    await expect(service.readBuffer('small.txt')).resolves.toEqual(
      Buffer.from('abcd'),
    );
  });

  it('下载流返回后取消仍应终止读取并关闭响应体', async () => {
    const service = buildService();
    const controller = new AbortController();
    const body = new PassThrough();
    send.mockResolvedValueOnce({ Body: body });
    const result = await service.get('cancelled.txt', {
      abortSignal: controller.signal,
    });
    const assertion = expect(consumeBody(result.body)).rejects.toThrow();

    controller.abort();

    await assertion;
    expect(body.destroyed).toBe(true);
  });

  it('下载流返回后超时仍应关闭未完成的响应体', async () => {
    vi.useFakeTimers();
    const service = buildService({ requestTimeoutMs: 50 });
    const body = new PassThrough();
    send.mockResolvedValueOnce({ Body: body });
    const result = await service.get('stalled.txt');
    const assertion = expect(consumeBody(result.body)).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(51);

    await assertion;
    expect(body.destroyed).toBe(true);
  });

  it('下载声明长度超过内存上限应关闭响应体并拒绝', async () => {
    const service = buildService({ maxBufferBytes: 3 });
    const body = new PassThrough();
    send.mockResolvedValueOnce({ Body: body, ContentLength: 4 });

    await expect(service.readBuffer('large.txt')).rejects.toThrow();
    expect(body.destroyed).toBe(true);
  });

  it('下载实际长度超过内存上限应拒绝，不能信任响应声明长度', async () => {
    const service = buildService({ maxBufferBytes: 3 });
    const body = Readable.from(['ab', 'cd']);
    send.mockResolvedValueOnce({ Body: body, ContentLength: 2 });

    await expect(service.readBuffer('large.txt')).rejects.toThrow();
    expect(body.destroyed).toBe(true);
  });

  it('readBuffer 应遵守调用方指定的更小上限', async () => {
    const service = buildService();
    send.mockResolvedValueOnce({ Body: Readable.from(['1234']) });

    await expect(
      service.readBuffer('limited.txt', { maxBytes: 3 }),
    ).rejects.toThrow();
  });

  it.each([0, -1, 1.5, 17, Number.NaN])(
    'readBuffer 应在发请求前拒绝无效或高于配置的上限：%s',
    async (maxBytes) => {
      const service = buildService();

      await expect(
        service.readBuffer('invalid-limit.txt', { maxBytes }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('下载源流错误应传播到 readBuffer 调用方', async () => {
    const service = buildService();
    const readError = new Error('下载连接中断');
    const body = new Readable({
      read() {
        this.destroy(readError);
      },
    });
    send.mockResolvedValueOnce({ Body: body });

    await expect(service.readBuffer('broken.txt')).rejects.toThrow(
      '下载连接中断',
    );
    expect(body.destroyed).toBe(true);
  });

  it('下载不存在的对象应透传错误', async () => {
    const service = buildService();
    const missing = Object.assign(new Error('NoSuchKey'), {
      $metadata: { httpStatusCode: 404 },
    });
    send.mockRejectedValueOnce(missing);

    await expect(service.get('missing.txt')).rejects.toBe(missing);
  });

  it('head 应返回对象元数据', async () => {
    const service = buildService();
    send.mockResolvedValueOnce({
      ContentLength: 3,
      ContentType: 'text/plain',
      ETag: '"head-etag"',
      Metadata: { source: 'unit-test' },
    });

    await expect(service.head('info.txt')).resolves.toMatchObject({
      contentLength: 3,
      contentType: 'text/plain',
      etag: '"head-etag"',
      metadata: { source: 'unit-test' },
    });
    const command = send.mock.calls[0][0] as HeadObjectCommand;
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({
      Bucket: TEST_CONFIG.bucket,
      Key: 'info.txt',
    });
  });

  it('head 仅应将明确 404 转换为 null', async () => {
    const service = buildService();
    send.mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), {
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await expect(service.head('missing.txt')).resolves.toBeNull();
  });

  it.each([403, 500])('head 遇到 HTTP %s 应保留错误', async (status) => {
    const service = buildService();
    const error = Object.assign(new Error('对象存储请求失败'), {
      $metadata: { httpStatusCode: status },
    });
    send.mockRejectedValueOnce(error);

    await expect(service.head('private.txt')).rejects.toBe(error);
  });

  it('head 不应将缺少 HTTP 404 的同名错误吞为 null', async () => {
    const service = buildService();
    const error = Object.assign(new Error('未确认的存储错误'), {
      name: 'NotFound',
    });
    send.mockRejectedValueOnce(error);

    await expect(service.head('unknown.txt')).rejects.toBe(error);
  });

  it('head 不应将 bucket 不存在误判为对象不存在', async () => {
    const service = buildService();
    const error = Object.assign(new Error('Bucket 不存在'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    });
    send.mockRejectedValueOnce(error);

    await expect(service.head('unknown.txt')).rejects.toBe(error);
  });

  it('删除应只操作指定 bucket 和 key', async () => {
    const service = buildService();
    send.mockResolvedValueOnce({});

    await expect(service.delete('obsolete.txt')).resolves.toBeUndefined();
    const command = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: TEST_CONFIG.bucket,
      Key: 'obsolete.txt',
    });
  });

  it('销毁服务应终止活跃上传并关闭 SDK 客户端', async () => {
    const service = buildService();
    const source = new PassThrough();
    const promise = service.put('unfinished.txt', source);
    const assertion = expect(promise).rejects.toThrow();
    await Promise.resolve();

    await service.onModuleDestroy();

    await assertion;
    expect(source.destroyed).toBe(true);
    expect(destroy).toHaveBeenCalled();
  });

  it('停机应以独立信号清理活跃分片并在清理完成后关闭客户端', async () => {
    const partSize = 5 * 1024 * 1024;
    const service = buildService({ maxUploadBytes: partSize * 2 });
    const sequence: string[] = [];
    send.mockImplementation(
      (command: unknown, options: { abortSignal: AbortSignal }) => {
        if (command instanceof CreateMultipartUploadCommand) {
          return Promise.resolve({ UploadId: 'unit-test-upload' });
        }
        if (command instanceof UploadPartCommand) {
          return new Promise((_resolve, reject) => {
            options.abortSignal.addEventListener(
              'abort',
              () => reject(new Error('分片请求取消')),
              { once: true },
            );
          });
        }
        if (command instanceof AbortMultipartUploadCommand) {
          sequence.push('abort-request');
          expect(options.abortSignal.aborted).toBe(false);
          return new Promise((resolve) =>
            setTimeout(() => {
              sequence.push('abort-complete');
              resolve({});
            }, 1),
          );
        }
        return Promise.reject(new Error('测试未配置此命令'));
      },
    );
    destroy.mockImplementation(() => sequence.push('destroy'));
    const promise = service.put(
      'unfinished.bin',
      Readable.from([Buffer.alloc(partSize + 1)]),
    );
    const assertion = expect(promise).rejects.toThrow();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    await service.onModuleDestroy();

    await assertion;
    expect(sequence).toEqual(['abort-request', 'abort-complete', 'destroy']);
  });

  it('销毁服务应关闭活跃下载流并拒绝后续请求', async () => {
    const service = buildService();
    const body = new PassThrough();
    send.mockResolvedValueOnce({ Body: body });
    const result = await service.get('unfinished.txt');
    const assertion = expect(consumeBody(result.body)).rejects.toThrow();

    await service.onModuleDestroy();

    await assertion;
    expect(body.destroyed).toBe(true);
    await expect(service.put('closed.txt', 'body')).rejects.toThrow();
    await expect(service.get('closed.txt')).rejects.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });
});
