import type { Readable } from 'node:stream';

export type StorageBody = string | Uint8Array | Readable;

export interface IStorageRequestOptions {
  abortSignal?: AbortSignal;
}

export interface IStoragePutOptions extends IStorageRequestOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface IStorageReadOptions extends IStorageRequestOptions {
  /** 仅可收紧配置中的内存读取上限，不可放宽。 */
  maxBytes?: number;
}

export interface IStoragePutResult {
  key: string;
  etag?: string;
}

export interface IStoragePresignPutOptions {
  /** 必须与浏览器实际发送的 Content-Type 一致；不是内容安全检测。 */
  contentType: string;
  /** 签名绑定的确切字节数，浏览器通过原始 File / Blob 自动设置请求长度。 */
  contentLength: number;
  /** 仅可收紧配置中的链接有效期。 */
  expiresInSeconds?: number;
}

export interface IStoragePresignedPut {
  key: string;
  url: string;
  method: 'PUT';
  /** 浏览器须原样发送；Content-Length 由浏览器管理，故不放在这里。 */
  headers: Record<string, string>;
  contentLength: number;
  expiresAt: string;
}

export interface IStorageObjectMetadata {
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface IStorageObject extends IStorageObjectMetadata {
  /** 调用方必须消费或 destroy，不能丢弃未消费的响应体。 */
  body: Readable;
}
