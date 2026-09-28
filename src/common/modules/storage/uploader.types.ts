import type { IStoragePresignPutOptions } from './storage.types';

export interface IUploaderCreateUploadOptions extends IStoragePresignPutOptions {
  /** 由业务服务决定的相对前缀；不接受原始文件名或客户端提供的完整 key。 */
  prefix?: string;
}

/** 必须从服务端保存的上传申请中读取，不能直接信任客户端回传的字段。 */
export interface IUploaderExpectedUpload {
  key: string;
  contentType: string;
  contentLength: number;
}
