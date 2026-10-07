import type { StorageConfigType } from '@/configs/storage.config';
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
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type {
  IStorageObject,
  IStorageObjectMetadata,
  IStoragePresignedPut,
  IStoragePresignPutOptions,
  IStorageReadOptions,
  IStorageRequestOptions,
  IStoragePutOptions,
  IStoragePutResult,
  StorageBody,
} from './storage.types';
import { isStorageContentType } from './storage.validation';

const PART_BYTES = 5 * 1024 * 1024;

/**
 * 单 bucket 的 S3 文件读写；不访问本地文件系统，不管理业务授权。
 * @see docs/modules/storage.md
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly _config: StorageConfigType;
  private readonly _client: S3Client;
  private _presignClient?: S3Client;
  private readonly _controllers = new Set<AbortController>();
  private readonly _uploads = new Set<Promise<IStoragePutResult>>();
  private _closed = false;

  constructor(configService: ConfigService) {
    this._config = configService.getOrThrow<StorageConfigType>('storage');
    this._client = this._createClient(this._config.endpoint);
  }

  private _createClient(endpoint: string, presigning = false): S3Client {
    return new S3Client({
      endpoint,
      region: this._config.region,
      forcePathStyle: this._config.forcePathStyle,
      // 显式凭据，绝不回退读取 AWS_*、用户目录或云实例身份。
      credentials: {
        accessKeyId: this._config.accessKeyId,
        secretAccessKey: this._config.secretAccessKey,
        sessionToken: this._config.sessionToken,
      },
      maxAttempts: 3,
      followRegionRedirects: false,
      // 签名时没有正文，不能把 SDK 对空正文的默认 checksum 签进真实文件请求。
      // 仅签名客户端关闭可选自动 checksum，服务端 put 保留 SDK 默认保护。
      requestChecksumCalculation: presigning
        ? 'WHEN_REQUIRED'
        : 'WHEN_SUPPORTED',
      requestHandler: {
        connectionTimeout: this._config.requestTimeoutMs,
        requestTimeout: this._config.requestTimeoutMs,
        throwOnRequestTimeout: true,
      },
    });
  }

  /**
   * 签发仅创建对象的短时 PUT；调用方先鉴权，链接不可记录日志。
   * 防覆盖由存储端原子执行 If-None-Match；删除对象后链接仍可能再次使用。
   */
  public async presignPut(
    key: string,
    options: IStoragePresignPutOptions,
  ): Promise<IStoragePresignedPut> {
    this._validateKey(key);
    this._assertOpen();
    if (
      !Number.isSafeInteger(options.contentLength) ||
      options.contentLength < 0 ||
      options.contentLength >
        Math.min(this._config.maxUploadBytes, 5 * 1024 ** 3)
    ) {
      throw new Error('Storage 直传文件大小无效或超过上限');
    }
    if (!isStorageContentType(options.contentType)) {
      throw new Error('Storage 直传文件类型无效');
    }
    const expiresInSeconds =
      options.expiresInSeconds ?? this._config.presignExpiresInSeconds;
    if (
      !Number.isSafeInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > this._config.presignExpiresInSeconds ||
      expiresInSeconds > 900
    ) {
      throw new Error('Storage 直传链接有效期无效或超过上限');
    }
    this._presignClient ??= this._createClient(
      this._config.publicEndpoint ?? this._config.endpoint,
      true,
    );
    // SigV4 时间精度为秒，返回与签名一致的过期时间。
    const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
    const url = await getSignedUrl(
      this._presignClient,
      new PutObjectCommand({
        Bucket: this._config.bucket,
        Key: key,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
        IfNoneMatch: '*',
      }),
      {
        expiresIn: expiresInSeconds,
        signingDate,
        // SDK 默认不签 Content-Type，显式签入全部限制，不能由调用方移除。
        signableHeaders: new Set([
          'content-type',
          'content-length',
          'if-none-match',
        ]),
      },
    );
    this._assertOpen();
    return {
      key,
      url,
      method: 'PUT',
      headers: { 'content-type': options.contentType, 'if-none-match': '*' },
      contentLength: options.contentLength,
      expiresAt: new Date(
        signingDate.getTime() + expiresInSeconds * 1000,
      ).toISOString(),
    };
  }

  /** 写入或替换指定对象；业务层负责对象 key、授权和并发覆盖策略。 */
  public async put(
    key: string,
    body: StorageBody,
    options: IStoragePutOptions = {},
  ): Promise<IStoragePutResult> {
    this._validateKey(key);
    this._assertOpen();
    options.abortSignal?.throwIfAborted();
    if (this._uploads.size >= this._config.maxConcurrentUploads) {
      throw new Error('Storage 上传并发已达上限');
    }
    const source = this._uploadSource(body);
    const task = this._upload(key, source, options);
    this._uploads.add(task);
    try {
      return await task;
    } finally {
      this._uploads.delete(task);
    }
  }

  /** 流式读取，调用方负责消费或销毁 body。超时覆盖整个读取过程。 */
  public async get(
    key: string,
    options: IStorageRequestOptions = {},
  ): Promise<IStorageObject> {
    this._validateKey(key);
    const operation = this._operation(
      this._config.requestTimeoutMs,
      options.abortSignal,
    );
    try {
      const result = await this._client.send(
        new GetObjectCommand({ Bucket: this._config.bucket, Key: key }),
        { abortSignal: operation.controller.signal },
      );
      const body = result.Body;
      if (!(body instanceof Readable)) {
        throw new Error('Storage 未返回可读取的数据流');
      }
      const abort = () => body.destroy(this._abortReason(operation.controller));
      const finish = () => {
        operation.controller.signal.removeEventListener('abort', abort);
        operation.dispose();
      };
      // 即使调用方还未开始消费，超时错误也有监听，避免未处理 error 终止进程。
      body.once('end', finish);
      body.once('close', finish);
      body.once('error', finish);
      operation.controller.signal.addEventListener('abort', abort, {
        once: true,
      });
      if (operation.controller.signal.aborted) abort();
      if (body.destroyed || body.readableEnded) finish();
      return {
        body,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        etag: result.ETag,
        lastModified: result.LastModified,
        metadata: result.Metadata,
      };
    } catch (error: unknown) {
      operation.dispose();
      throw error;
    }
  }

  /** 仅用于有明确大小上限的小文件；大文件使用 get() 的流。 */
  public async readBuffer(
    key: string,
    options: IStorageReadOptions = {},
  ): Promise<Buffer> {
    const limit = options.maxBytes ?? this._config.maxBufferBytes;
    if (
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      limit > this._config.maxBufferBytes
    ) {
      throw new Error('Storage 内存读取上限无效');
    }
    const object = await this.get(key, options);
    try {
      if ((object.contentLength ?? 0) > limit) {
        throw new Error('Storage 对象超过内存读取上限');
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of object.body) {
        const buffer = this._buffer(chunk);
        bytes += buffer.byteLength;
        if (bytes > limit) throw new Error('Storage 对象超过内存读取上限');
        chunks.push(buffer);
      }
      return Buffer.concat(chunks, bytes);
    } finally {
      object.body.destroy();
    }
  }

  public async head(
    key: string,
    options: IStorageRequestOptions = {},
  ): Promise<IStorageObjectMetadata | null> {
    this._validateKey(key);
    const operation = this._operation(
      this._config.requestTimeoutMs,
      options.abortSignal,
    );
    try {
      const result = await this._client.send(
        new HeadObjectCommand({ Bucket: this._config.bucket, Key: key }),
        { abortSignal: operation.controller.signal },
      );
      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        etag: result.ETag,
        lastModified: result.LastModified,
        metadata: result.Metadata,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404 &&
        !('name' in error && error.name === 'NoSuchBucket')
      ) {
        return null;
      }
      throw error;
    } finally {
      operation.dispose();
    }
  }

  /** 幂等删除单个 key，不提供删除 bucket / 清空前缀等危险接口。 */
  public async delete(
    key: string,
    options: IStorageRequestOptions = {},
  ): Promise<void> {
    this._validateKey(key);
    const operation = this._operation(
      this._config.requestTimeoutMs,
      options.abortSignal,
    );
    try {
      await this._client.send(
        new DeleteObjectCommand({ Bucket: this._config.bucket, Key: key }),
        { abortSignal: operation.controller.signal },
      );
    } finally {
      operation.dispose();
    }
  }

  public async onModuleDestroy(): Promise<void> {
    this._closed = true;
    for (const controller of this._controllers) {
      controller.abort(new Error('Storage 已关闭'));
    }
    // 先给在途上传清理分片的机会，再关闭客户端连接。
    await Promise.allSettled(this._uploads);
    this._client.destroy();
    this._presignClient?.destroy();
  }

  private async _upload(
    key: string,
    source: Readable,
    options: IStoragePutOptions,
  ): Promise<IStoragePutResult> {
    const operation = this._operation(
      this._config.uploadTimeoutMs,
      options.abortSignal,
    );
    const signal = operation.controller.signal;
    const abort = () => source.destroy(this._abortReason(operation.controller));
    const sourceError = (error: Error) => operation.controller.abort(error);
    source.on('error', sourceError);
    signal.addEventListener('abort', abort, { once: true });
    const parameters = {
      Bucket: this._config.bucket,
      Key: key,
      ContentType: options.contentType ?? 'application/octet-stream',
      Metadata: options.metadata,
    };
    let uploadId: string | undefined;
    try {
      const parts: CompletedPart[] = [];
      for await (const part of this._parts(source)) {
        signal.throwIfAborted();
        if (!uploadId && part.length < PART_BYTES) {
          const result = await this._client.send(
            new PutObjectCommand({ ...parameters, Body: part }),
            { abortSignal: signal },
          );
          return { key, etag: result.ETag };
        }
        if (!uploadId) {
          const result = await this._client.send(
            new CreateMultipartUploadCommand(parameters),
            { abortSignal: signal },
          );
          uploadId = result.UploadId;
          if (!uploadId) throw new Error('Storage 未返回 multipart 上传标识');
        }
        const partNumber = parts.length + 1;
        if (partNumber > 10_000) throw new Error('Storage 分片数量超过上限');
        const result = await this._client.send(
          new UploadPartCommand({
            Bucket: this._config.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: part,
          }),
          { abortSignal: signal },
        );
        if (!result.ETag) throw new Error('Storage 分片未返回 ETag');
        parts.push({ PartNumber: partNumber, ETag: result.ETag });
      }
      signal.throwIfAborted();
      if (!uploadId) {
        const result = await this._client.send(
          new PutObjectCommand({ ...parameters, Body: Buffer.alloc(0) }),
          { abortSignal: signal },
        );
        return { key, etag: result.ETag };
      }
      const result = await this._client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this._config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
        { abortSignal: signal },
      );
      return { key, etag: result.ETag };
    } catch (error: unknown) {
      // for-await 退出后可能异步触发源流 AbortError，不能让清理错误覆盖原始失败。
      const failure = signal.aborted
        ? this._abortReason(operation.controller)
        : error;
      if (uploadId) {
        try {
          // 清理使用独立且有界的信号，不能复用已经取消的上传信号。
          await this._client.send(
            new AbortMultipartUploadCommand({
              Bucket: this._config.bucket,
              Key: key,
              UploadId: uploadId,
            }),
            {
              abortSignal: AbortSignal.timeout(
                Math.min(this._config.requestTimeoutMs, 5_000),
              ),
            },
          );
        } catch (cleanupError: unknown) {
          throw new AggregateError(
            [failure, cleanupError],
            'Storage 上传失败且分片清理失败，请检查存储生命周期规则',
            { cause: cleanupError },
          );
        }
      }
      throw failure;
    } finally {
      signal.removeEventListener('abort', abort);
      operation.dispose();
      source.destroy();
      // source 的异步 error 仍可能在 destroy 后到达，保留处理器防止未处理异常。
    }
  }

  /** 单上传最多积累一个 5 MiB 分片；读取速率随 S3 上传背压推进。 */
  private async *_parts(source: Readable): AsyncGenerator<Buffer> {
    let part = Buffer.allocUnsafe(PART_BYTES);
    let used = 0;
    let total = 0;
    for await (const chunk of source) {
      const data = this._buffer(chunk);
      total += data.length;
      if (total > this._config.maxUploadBytes) {
        throw new Error('Storage 文件超过上传大小上限');
      }
      let offset = 0;
      while (offset < data.length) {
        const size = Math.min(PART_BYTES - used, data.length - offset);
        data.copy(part, used, offset, offset + size);
        used += size;
        offset += size;
        if (used === PART_BYTES) {
          yield part;
          part = Buffer.allocUnsafe(PART_BYTES);
          used = 0;
        }
      }
    }
    if (used) yield part.subarray(0, used);
  }

  private _uploadSource(body: StorageBody): Readable {
    if (body instanceof Readable) return body;
    const buffer = this._buffer(body);
    if (buffer.length > this._config.maxUploadBytes) {
      throw new Error('Storage 文件超过上传大小上限');
    }
    return Readable.from([buffer]);
  }

  private _buffer(value: unknown): Buffer {
    if (typeof value === 'string') return Buffer.from(value);
    if (value instanceof Uint8Array) {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError('Storage 只接受文本或二进制数据流');
  }

  private _operation(timeoutMs: number, externalSignal?: AbortSignal) {
    this._assertOpen();
    externalSignal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('Storage 操作超时')),
      timeoutMs,
    );
    timer.unref();
    this._controllers.add(controller);
    return {
      controller,
      dispose: () => {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abort);
        this._controllers.delete(controller);
      },
    };
  }

  private _abortReason(controller: AbortController): Error {
    const reason: unknown = controller.signal.reason;
    return reason instanceof Error ? reason : new Error('Storage 操作已取消');
  }

  private _assertOpen(): void {
    if (this._closed) throw new Error('Storage 已关闭');
  }

  private _validateKey(key: string): void {
    if (
      typeof key !== 'string' ||
      !key.trim() ||
      Buffer.byteLength(key) > 1024 ||
      key.includes('\\') ||
      [...key].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('Storage 对象 key 无效');
    }
  }
}
