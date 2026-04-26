# Scripts

两个工具脚本，配合 SKILL.md 使用。

## bootstrap.sh

从零搭建一个同款 NestJS 脚手架到新目录。

```bash
bash .cursor/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>
```

参数：

- `<target-dir>`：新项目目标目录（必须不存在）。
- `<APP_NAME>`：kebab-case 小写名（如 `my-new-api`），会写入 `package.json` 与 `.env` 的 `APP_NAME`。

行为：

1. 用 `rsync`（或 `cp`）把本仓库拷贝到目标目录，**排除** `node_modules` / `dist` / `coverage` / `.tmp` / `logs` / `.git` / `.env`。
2. 改写目标目录的 `package.json` 字段：`name=$APP_NAME`、`version=0.0.1`。
3. 用目标目录的 `.env.example` 生成 `.env` 并替换 `APP_NAME`。
4. `git init -b main` + 一条 `chore: bootstrap from nest-scaffold` 提交。
5. 输出后续手动步骤（pnpm install / docker compose / db:push / db:init / db:seed / start:dev）。

约束：

- 必须从本仓库内运行（脚本通过相对路径定位 scaffold 根）。
- macOS 与 Linux 都兼容（兼容 `sed -i` 差异）。
- 需要 `python3`（用来稳健地修改 JSON）。

## new-module.sh

在已有 nest-scaffold 项目内生成一个新业务模块。

```bash
bash .cursor/skills/nest-scaffold/scripts/new-module.sh <feature-kebab-singular> [feature-kebab-plural]
```

参数：

- `<feature-kebab-singular>`：kebab-case 单数形式（如 `user-profile`）。
- `[feature-kebab-plural]`：kebab-case 复数形式（默认 `<singular>s`，如 `user-profiles`）。**用于表名 / 路由 / Schema 变量**。

行为：

1. 自动找到当前仓库根（往上找 `package.json` + `src/app`）。
2. 从 `templates/feature-module/` 拷贝并替换占位符（用途见模板内具体上下文）：
   - `__feature__`        → 单数 kebab（`user-profile`），用于文件名/路径/字符串
   - `__features__`       → 复数 kebab（`user-profiles`），用于路由/表名字符串
   - `__Feature__`        → 单数 PascalCase（`UserProfile`），用于类名
   - `__featureCamel__`   → 单数 camelCase（`userProfile`），用于属性/参数/局部变量
   - `__featuresCamel__`  → 复数 camelCase（`userProfiles`），用于 Drizzle Schema 变量名
   - `__FEATURE__`        → 单数 UPPER_SNAKE（`USER_PROFILE`），用于常量
   - 替换顺序：先 Camel 占位符，再 Pascal/UPPER，再 kebab 复数 → kebab 单数（避免前缀互吃）
3. 生成：
   - `src/app/api/<feature>/`（controller / service / module / dtos / entities / __tests__）
   - `src/app/repositories/<feature>.repository.ts`
   - `src/database/schemas/<features>.schema.ts`（如不存在，从 `templates/schema.ts.tpl` 生成桩）
4. 输出后续手动步骤（更新 schemas/index.ts、api.module.ts、db:push、补 TODO、跑测试）。

约束：

- 输入必须是合法 kebab-case（`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`）。
- 同名模块/仓储已存在时拒绝执行（保护）。
- 默认复数推导是简单加 `s`，对 `category`→`categorys` 等不规则名词需手动传第 2 参数（`category categories`）。

## 故障排查

- **`错误: 未找到仓库根目录`**：脚本要求当前工作目录或祖先有 `package.json` + `src/app/`。请进入项目根再跑。
- **替换后的代码 lint 报错**：先 `pnpm lint --fix`，常见是 import 顺序与 prettier 行尾。
- **`db:push` 报表不存在**：确认 `src/database/schemas/index.ts` 已 `export * from './<features>.schema'`。
- **Swagger 报 schema 名重复**：检查 DTO 的 `@DtoSchema({ name: '...' })` 是否唯一（脚本生成的命名都基于路径）。
