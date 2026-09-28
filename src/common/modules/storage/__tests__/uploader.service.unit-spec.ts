import type { StorageService } from '../storage.service';
import type {
  IStorageObjectMetadata,
  IStoragePresignedPut,
} from '../storage.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploaderService } from '../uploader.service';

describe('UploaderService', () => {
  const presignPut = vi.fn();
  const head = vi.fn();
  const deleteObject = vi.fn();
  let service: UploaderService;

  const expected = {
    key: 'uploads/created-by-server',
    contentType: 'text/plain; charset=utf-8',
    contentLength: 12,
  };
  const metadata: IStorageObjectMetadata = {
    contentType: expected.contentType,
    contentLength: expected.contentLength,
    etag: 'uploaded-object-etag',
  };

  beforeEach(() => {
    presignPut.mockReset();
    head.mockReset();
    deleteObject.mockReset();
    presignPut.mockRejectedValue(new Error('测试未显式配置预签名响应'));
    head.mockRejectedValue(new Error('测试未显式配置对象元数据'));
    deleteObject.mockRejectedValue(new Error('核验不得删除对象'));
    service = new UploaderService({
      presignPut,
      head,
      delete: deleteObject,
    } as unknown as StorageService);
  });

  it('应生成默认前缀下的随机 key，转发写入条件并原样返回签名结果', async () => {
    const result: IStoragePresignedPut = {
      key: 'uploads/generated-key',
      url: 'https://storage.example.invalid/presigned',
      method: 'PUT',
      headers: {
        'content-type': expected.contentType,
        'if-none-match': '*',
      },
      contentLength: expected.contentLength,
      expiresAt: '2030-01-01T00:05:00.000Z',
    };
    presignPut.mockResolvedValue(result);

    await expect(
      service.createUpload({
        contentType: expected.contentType,
        contentLength: expected.contentLength,
        expiresInSeconds: 120,
      }),
    ).resolves.toBe(result);
    expect(presignPut).toHaveBeenCalledWith(
      expect.stringMatching(
        /^uploads\/[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/,
      ),
      {
        contentType: expected.contentType,
        contentLength: expected.contentLength,
        expiresInSeconds: 120,
      },
    );
    expect(head).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('应支持业务指定的安全前缀，且每次生成不同 key', async () => {
    presignPut.mockResolvedValue({});
    const options = {
      contentType: 'image/png',
      contentLength: 16,
      prefix: 'tenant_123/profile-images',
    };

    await service.createUpload(options);
    await service.createUpload(options);

    const [first, second] = presignPut.mock.calls;
    expect(first[0]).toMatch(/^tenant_123\/profile-images\//);
    expect(second[0]).toMatch(/^tenant_123\/profile-images\//);
    expect(first[0]).not.toBe(second[0]);
    expect(first[1]).toEqual({
      contentType: 'image/png',
      contentLength: 16,
      expiresInSeconds: undefined,
    });
  });

  it('应允许长度上限内的前缀且忽略额外传入的文件名与完整 key', async () => {
    presignPut.mockResolvedValue({});
    const options = {
      contentType: 'text/plain',
      contentLength: 1,
      prefix: 'a'.repeat(200),
      key: 'someone-elses-file',
      filename: '../untrusted.txt',
    };

    await service.createUpload(options);

    const [key, forwarded] = presignPut.mock.calls[0] as [unknown, unknown];
    expect(key).toMatch(new RegExp(`^${options.prefix}/[a-f\\d-]{36}$`));
    expect(forwarded).toEqual({
      contentType: 'text/plain',
      contentLength: 1,
      expiresInSeconds: undefined,
    });
  });

  it.each([
    '',
    '/absolute',
    'trailing/',
    'a//b',
    '.',
    '..',
    'a/../b',
    'file.txt',
    'a\\b',
    'a b',
    '中文',
    'a\nb',
    'a\u0000b',
    'a'.repeat(201),
  ])('应在签名前拒绝不安全前缀：%s', async (prefix) => {
    await expect(
      service.createUpload({
        contentType: 'text/plain',
        contentLength: 1,
        prefix,
      }),
    ).rejects.toThrow('对象前缀无效');
    expect(presignPut).not.toHaveBeenCalled();
  });

  it('应透传存储签名错误而不进行任何对象写入或删除', async () => {
    const error = new Error('Storage 文件大小超过上限');
    presignPut.mockRejectedValue(error);

    await expect(
      service.createUpload({ contentType: 'text/plain', contentLength: 123 }),
    ).rejects.toBe(error);
    expect(head).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('应核验大小和类型并透传中止信号，返回原始元数据', async () => {
    const options = { abortSignal: new AbortController().signal };
    head.mockResolvedValue(metadata);

    await expect(service.verifyUpload(expected, options)).resolves.toBe(
      metadata,
    );
    expect(head).toHaveBeenCalledWith(expected.key, options);
    expect(presignPut).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('应允许核验零字节对象', async () => {
    head.mockResolvedValue({ ...metadata, contentLength: 0 });

    await expect(
      service.verifyUpload({ ...expected, contentLength: 0 }),
    ).resolves.toMatchObject({ contentLength: 0 });
  });

  it.each([
    'application/octet-stream',
    'image/svg+xml',
    'application/vnd.example+json',
    'text/plain; charset=utf-8',
    'text/plain; charset="utf-8"; x-note="a;b"',
  ])('应接受合法 MIME 值及参数：%s', async (contentType) => {
    head.mockResolvedValue({ ...metadata, contentType });

    await expect(
      service.verifyUpload({ ...expected, contentType }),
    ).resolves.toMatchObject({ contentType });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    '应在读取前拒绝无效预期大小：%s',
    async (contentLength) => {
      await expect(
        service.verifyUpload({ ...expected, contentLength }),
      ).rejects.toThrow('预期文件大小无效');
      expect(head).not.toHaveBeenCalled();
    },
  );

  it.each([
    '',
    'text',
    '/plain',
    'text/',
    'text/plain\r\nx-injected: value',
    'text/plain\u0000',
    'text/plain\u007f',
    'text/plain; charset=中文',
    'text/plain; charset=',
    'text/plain; charset="unfinished',
    `text/${'a'.repeat(251)}`,
  ])('应在读取前拒绝无效预期类型：%s', async (contentType) => {
    await expect(
      service.verifyUpload({ ...expected, contentType }),
    ).rejects.toThrow('预期文件类型无效');
    expect(head).not.toHaveBeenCalled();
  });

  it.each([
    ['对象不存在', null, '上传对象不存在'],
    ['大小不符', { ...metadata, contentLength: 13 }, '对象大小不匹配'],
    ['缺失大小', { contentType: expected.contentType }, '对象大小不匹配'],
    ['类型不符', { ...metadata, contentType: 'image/png' }, '对象类型不匹配'],
    ['缺失类型', { contentLength: expected.contentLength }, '对象类型不匹配'],
  ])('核验失败时应拒绝且不删除对象：%s', async (_label, actual, message) => {
    head.mockResolvedValue(actual);

    await expect(service.verifyUpload(expected)).rejects.toThrow(message);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('应原样透传存储异常，不误报对象不存在或尝试删除', async () => {
    const error = new Error('AccessDenied');
    head.mockRejectedValue(error);

    await expect(service.verifyUpload(expected)).rejects.toBe(error);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
