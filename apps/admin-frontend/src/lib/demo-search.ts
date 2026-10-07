import { z } from 'zod';
import {
  demoTypeSchema,
  demoOrderColumnSchema,
  demoOrderDirectionSchema,
} from '@nest-scaffold/contracts';

export const demoSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(10),
  name: z.string().trim().max(100).catch(''),
  type: demoTypeSchema.optional().catch(undefined),
  orderColumn: demoOrderColumnSchema.catch('createdAt'),
  orderDirection: demoOrderDirectionSchema.catch('desc'),
});

export type DemoSearch = z.infer<typeof demoSearchSchema>;
export const defaultDemoSearch = demoSearchSchema.parse({});
export const demoLinkClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function parseDemoId(value: string) {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null;
}
