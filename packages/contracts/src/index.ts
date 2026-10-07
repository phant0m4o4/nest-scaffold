import { z } from 'zod';

// 这里只描述 HTTP JSON 契约，不依赖 Nest、数据库或任何平台存储。
export const demoTypeSchema = z.enum(['TYPE_1', 'TYPE_2', 'TYPE_3']);
export type DemoType = z.infer<typeof demoTypeSchema>;

export const demoIdSchema = z.number().int().positive();
export const demoPublicIdSchema = z.string().min(1);

export const createDemoSchema = z.object({
  name: z.string().trim().min(1, '请输入名称').max(100, '名称最多 100 个字符'),
  type: demoTypeSchema,
  parentId: demoIdSchema.nullable().optional(),
});
export type CreateDemoInput = z.infer<typeof createDemoSchema>;

export const updateDemoSchema = createDemoSchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: '至少提供一个可更新字段' },
  );
export type UpdateDemoInput = z.infer<typeof updateDemoSchema>;

export const demoOrderColumnSchema = z.enum([
  'id',
  'name',
  'type',
  'createdAt',
  'updatedAt',
]);
export const demoOrderDirectionSchema = z.enum(['asc', 'desc']);

export const demoListQuerySchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  name: z.string().optional(),
  type: demoTypeSchema.optional(),
  orderColumn: demoOrderColumnSchema.optional(),
  orderDirection: demoOrderDirectionSchema.optional(),
});
export type DemoListQuery = z.infer<typeof demoListQuerySchema>;

export const publicDemoSchema = z.object({
  publicId: z.string(),
  shortPublicId: z.string(),
  name: z.string(),
  type: demoTypeSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PublicDemo = z.infer<typeof publicDemoSchema>;

export const adminDemoSchema = publicDemoSchema.extend({
  id: z.number(),
  parentId: z.number().nullable(),
});
export type AdminDemo = z.infer<typeof adminDemoSchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const publicDemoListSchema = z.object({
  statusCode: z.literal(200),
  data: z.array(publicDemoSchema),
  meta: paginationMetaSchema,
});
export const adminDemoListSchema = publicDemoListSchema.extend({
  data: z.array(adminDemoSchema),
});
export type PublicDemoList = z.infer<typeof publicDemoListSchema>;
export type AdminDemoList = z.infer<typeof adminDemoListSchema>;

export const publicDemoDetailSchema = z.object({
  statusCode: z.literal(200),
  data: publicDemoSchema.nullable(),
});
export const adminDemoDetailSchema = publicDemoDetailSchema.extend({
  data: adminDemoSchema.nullable(),
});
export type PublicDemoDetail = z.infer<typeof publicDemoDetailSchema>;
export type AdminDemoDetail = z.infer<typeof adminDemoDetailSchema>;

export const createAdminDemoResponseSchema = z.object({
  statusCode: z.literal(201),
  data: z.object({ id: demoIdSchema }),
});
export type CreateAdminDemoResponse = z.infer<
  typeof createAdminDemoResponseSchema
>;

export const demoMutationResponseSchema = z.object({
  statusCode: z.literal(200),
});
export type DemoMutationResponse = z.infer<typeof demoMutationResponseSchema>;

export const apiFieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type ApiFieldError = z.infer<typeof apiFieldErrorSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  errors: z.array(apiFieldErrorSchema).optional(),
});
