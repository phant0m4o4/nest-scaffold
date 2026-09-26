import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as mysqlCore from 'drizzle-orm/mysql-core';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FindManyByCursoredPaginationDto } from '@/app/api/common/dtos/find-many-by-cursored-pagination.dto';
import { FindManyByPaginationDto } from '@/app/api/common/dtos/find-many-by-pagination.dto';
import { createZodDto } from '@/common/utils/zod/create-zod-dto';

describe('业务模块生成器', () => {
  let projectDir: string;
  let updateSchema: z.ZodType<{ name?: string }>;
  let orderableColumns: string[] | undefined;
  let cursorOrderableColumns: string[] | undefined;

  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'nest-scaffold-module-'));
    await mkdir(join(projectDir, 'src/app/repositories'), { recursive: true });
    await mkdir(join(projectDir, 'src/database/mysql/schemas'), {
      recursive: true,
    });
    await writeFile(join(projectDir, 'package.json'), '{}');

    const script = resolve(
      '.claude/skills/nest-scaffold/scripts/new-module.sh',
    );
    for (const args of [['user-profile'], ['category', 'categories']]) {
      execFileSync('bash', [script, ...args], {
        cwd: projectDir,
        timeout: 10_000,
        stdio: 'pipe',
      });
    }

    const dtoFile = join(
      projectDir,
      'src/app/api/user-profile/dtos/update-user-profile-request.dto.ts',
    );
    const generated = (await import(pathToFileURL(dtoFile).href)) as {
      UpdateUserProfileRequestDto: { schema: typeof updateSchema };
    };
    updateSchema = generated.UpdateUserProfileRequestDto.schema;

    // 模拟生成后按业务扩展表字段，验证模板对可空字段和复杂类型的约束。
    const schema = mysqlCore.mysqlTable('user-profiles', {
      id: mysqlCore.int().primaryKey(),
      name: mysqlCore.varchar({ length: 100 }).notNull(),
      createdAt: mysqlCore.timestamp().notNull(),
      optionalName: mysqlCore.varchar({ length: 100 }),
      payload: mysqlCore.json().notNull(),
      active: mysqlCore.boolean().notNull(),
    });
    const findManyFile = join(
      projectDir,
      'src/app/api/user-profile/dtos/find-many-user-profile-request.dto.ts',
    );
    const findMany: {
      USER_PROFILE_ORDERABLE_COLUMNS?: string[];
      USER_PROFILE_CURSOR_ORDERABLE_COLUMNS?: string[];
    } = {};
    const imports: Record<string, unknown> = {
      '@/app/api/common/dtos/find-many-by-cursored-pagination.dto': {
        FindManyByCursoredPaginationDto,
      },
      '@/app/api/common/dtos/find-many-by-pagination.dto': {
        FindManyByPaginationDto,
      },
      '@/common/utils/zod/create-zod-dto': { createZodDto },
      '@/database/mysql/schemas/user-profiles.schema': {
        userProfilesSchema: schema,
      },
      'drizzle-orm/mysql-core': mysqlCore,
      zod: { z },
    };
    const compiled = ts.transpileModule(await readFile(findManyFile, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    });
    // 临时项目没有完整源码；执行实际生成的 DTO，仅显式提供其依赖。
    runInNewContext(compiled.outputText, {
      exports: findMany,
      require: (specifier: string) => {
        if (!(specifier in imports)) {
          throw new Error(`未声明的模板依赖: ${specifier}`);
        }
        return imports[specifier];
      },
    });
    orderableColumns = findMany.USER_PROFILE_ORDERABLE_COLUMNS;
    cursorOrderableColumns = findMany.USER_PROFILE_CURSOR_ORDERABLE_COLUMNS;
  });

  afterAll(async () => {
    if (projectDir) {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('连字符名称和显式复数生成的 TypeScript 文件应当没有语法错误', async () => {
    const sourceDir = join(projectDir, 'src');
    const files = (await readdir(sourceDir, { recursive: true })).filter(
      (file) => file.endsWith('.ts'),
    );
    expect(files).toHaveLength(24);

    for (const file of files) {
      const source = await readFile(join(sourceDir, file), 'utf8');
      const result = ts.transpileModule(source, {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.CommonJS,
          experimentalDecorators: true,
        },
      });
      const errors = (result.diagnostics ?? [])
        .filter(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
        )
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      expect(errors, file).toEqual([]);
    }
    const schema = await readFile(
      join(sourceDir, 'database/mysql/schemas/categories.schema.ts'),
      'utf8',
    );
    expect(schema).toContain('export const categoriesSchema');
  });

  it('更新请求应当接受合法字段', () => {
    expect(updateSchema.parse({ name: '新名称' })).toEqual({ name: '新名称' });
  });

  it.each([{}, { unknownField: '不会保存' }])(
    '更新请求应当拒绝没有可更新字段的输入 %j',
    (input) => {
      expect(updateSchema.safeParse(input).success).toBe(false);
    },
  );

  it('游标只允许非空的字符串、数字、日期列，页码仍保留全部列', () => {
    expect(cursorOrderableColumns).toEqual(['id', 'name', 'createdAt']);
    expect(orderableColumns).toEqual([
      'id',
      'name',
      'createdAt',
      'optionalName',
      'payload',
      'active',
    ]);
  });

  it('生成的服务应当按游标专用列解析排序', async () => {
    const service = await readFile(
      join(projectDir, 'src/app/api/user-profile/user-profile.service.ts'),
      'utf8',
    );
    expect(service).toMatch(
      /parseOrderQuery\(orderRaw,\s*USER_PROFILE_CURSOR_ORDERABLE_COLUMNS\)/,
    );
  });
});
