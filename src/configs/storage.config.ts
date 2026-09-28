import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

const endpoint = z
  .string()
  .url()
  .superRefine((value, context) => {
    // url() 校验失败后 refinement 仍可能执行，不能抛出包含原始输入的裸 URL 异常。
    if (!URL.canParse(value)) return;
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    ) {
      context.addIssue({
        code: 'custom',
        message: '必须是无凭据、路径、查询和片段的 HTTP(S) 服务地址',
      });
    }
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    STORAGE_S3_ENDPOINT: endpoint,
    STORAGE_S3_PUBLIC_ENDPOINT: endpoint.optional(),
    STORAGE_S3_REGION: z.string().trim().min(1).default('us-east-1'),
    STORAGE_S3_BUCKET: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
      .refine(
        (value) =>
          !value.includes('..') &&
          !value.includes('.-') &&
          !value.includes('-.') &&
          !/^\d+\.\d+\.\d+\.\d+$/.test(value),
        '必须是有效的 bucket 名称',
      ),
    STORAGE_S3_ACCESS_KEY_ID: z.string().trim().min(1),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1),
    STORAGE_S3_SESSION_TOKEN: z.string().min(1).optional(),
    STORAGE_S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    STORAGE_MAX_UPLOAD_BYTES: optionalEnvInt(1),
    STORAGE_MAX_BUFFER_BYTES: optionalEnvInt(1),
    STORAGE_UPLOAD_TIMEOUT_MS: optionalEnvInt(1),
    STORAGE_REQUEST_TIMEOUT_MS: optionalEnvInt(1),
    STORAGE_MAX_CONCURRENT_UPLOADS: optionalEnvInt(1),
    STORAGE_PRESIGN_EXPIRES_SECONDS: optionalEnvInt(1),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === 'production' &&
      !env.STORAGE_S3_ENDPOINT.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_S3_ENDPOINT'],
        message: '生产环境必须使用 HTTPS',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.STORAGE_S3_PUBLIC_ENDPOINT !== undefined &&
      !env.STORAGE_S3_PUBLIC_ENDPOINT.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_S3_PUBLIC_ENDPOINT'],
        message: '生产环境必须使用 HTTPS',
      });
    }
    if ((env.STORAGE_PRESIGN_EXPIRES_SECONDS ?? 0) > 900) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_PRESIGN_EXPIRES_SECONDS'],
        message: '直传链接有效期不能超过 900 秒',
      });
    }
    for (const key of [
      'STORAGE_UPLOAD_TIMEOUT_MS',
      'STORAGE_REQUEST_TIMEOUT_MS',
    ] as const) {
      if ((env[key] ?? 0) > 2_147_483_647) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: '不能超过 Node.js 定时器上限',
        });
      }
    }
  });

/** 独立的 S3 配置；不读取 AWS 默认凭据链或本地凭据文件。 */
const storageConfig = registerEnvAsConfig(
  'storage',
  environmentSchema,
  (env) => ({
    endpoint: env.STORAGE_S3_ENDPOINT,
    publicEndpoint: env.STORAGE_S3_PUBLIC_ENDPOINT,
    region: env.STORAGE_S3_REGION,
    bucket: env.STORAGE_S3_BUCKET,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    sessionToken: env.STORAGE_S3_SESSION_TOKEN,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    maxUploadBytes: env.STORAGE_MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024,
    maxBufferBytes: env.STORAGE_MAX_BUFFER_BYTES ?? 5 * 1024 * 1024,
    uploadTimeoutMs: env.STORAGE_UPLOAD_TIMEOUT_MS ?? 120_000,
    requestTimeoutMs: env.STORAGE_REQUEST_TIMEOUT_MS ?? 30_000,
    maxConcurrentUploads: env.STORAGE_MAX_CONCURRENT_UPLOADS ?? 4,
    presignExpiresInSeconds: env.STORAGE_PRESIGN_EXPIRES_SECONDS ?? 300,
  }),
);

export default storageConfig;
export type StorageConfigType = ConfigType<typeof storageConfig>;
