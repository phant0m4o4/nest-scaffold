import storageConfig from '@/configs/storage.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { UploaderService } from './uploader.service';

/** S3 兼容文件存储，业务模块按需导入；不创建 bucket 或公开上传接口。 */
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [StorageService, UploaderService],
  exports: [StorageService, UploaderService],
})
export class StorageModule {}
