import { StorageService } from './storage.service';
import type {
  IStorageObjectMetadata,
  IStoragePresignedPut,
  IStorageRequestOptions,
} from './storage.types';
import { isStorageContentType } from './storage.validation';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  IUploaderCreateUploadOptions,
  IUploaderExpectedUpload,
} from './uploader.types';

/** 只编排短时直传和只读核验，不处理业务授权、上传记录或文件内容安全。 */
@Injectable()
export class UploaderService {
  constructor(private readonly _storage: StorageService) {}

  /** 调用前完成业务鉴权和配额校验；链接为短时防覆盖，不是严格一次性。 */
  public async createUpload(
    options: IUploaderCreateUploadOptions,
  ): Promise<IStoragePresignedPut> {
    const prefix = options.prefix ?? 'uploads';
    if (
      typeof prefix !== 'string' ||
      prefix.length > 200 ||
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)
    ) {
      throw new Error('Uploader 对象前缀无效');
    }
    return this._storage.presignPut(`${prefix}/${randomUUID()}`, {
      contentType: options.contentType,
      contentLength: options.contentLength,
      expiresInSeconds: options.expiresInSeconds,
    });
  }

  /**
   * expected 必须来自业务持久化的可信记录；此方法不鉴权、不标记消费，也不删除对象。
   * 只比对元数据，不识别真实文件类型；并发状态与业务关联由调用方处理。
   */
  public async verifyUpload(
    expected: IUploaderExpectedUpload,
    options: IStorageRequestOptions = {},
  ): Promise<IStorageObjectMetadata> {
    if (
      !Number.isSafeInteger(expected.contentLength) ||
      expected.contentLength < 0
    ) {
      throw new Error('Uploader 预期文件大小无效');
    }
    if (!isStorageContentType(expected.contentType)) {
      throw new Error('Uploader 预期文件类型无效');
    }

    const metadata = await this._storage.head(expected.key, options);
    if (!metadata) throw new Error('Uploader 上传对象不存在');
    if (metadata.contentLength !== expected.contentLength) {
      throw new Error('Uploader 上传对象大小不匹配');
    }
    if (metadata.contentType !== expected.contentType) {
      throw new Error('Uploader 上传对象类型不匹配');
    }
    return metadata;
  }
}
