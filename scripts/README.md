# 开发脚本

在仓库根目录执行下列脚本，无需安装任何 AI 工具。开发约定见 [开发文档](../docs/README.md)，代码生成模板位于 [templates/](templates/)。

## bootstrap.sh

从零搭建一个包含 API、管理后台和手机前端的同款工作区到新目录。

```bash
bash scripts/bootstrap.sh <target-dir> <APP_NAME>
```

参数：

- `<target-dir>`：新项目目标目录（必须不存在，且解析符号链接后不能位于脚手架目录内或等于脚手架目录）。从脚手架根目录运行时可使用 `../my-new-api`。
- `<APP_NAME>`：kebab-case 小写名（如 `my-new-api`），会更新根 `package.json` 的项目名及 API 环境模板 / 本地配置中的 `APP_NAME`。

行为：

1. 用 `rsync`（无 rsync 时用 `tar`）复制源码与共享配置，两种方式使用同一排除清单：`node_modules`、`.pnpm-store`、`dist`、`build`、`coverage`、`.nyc_output`、`.cache`、`.vite`、`.turbo`、`.tmp`、`.temp`、`logs`、`.git`、`.env` / `.env.*`、`.ssh`、`.expo`、整个 `.claude`、系统元数据和编辑器临时文件。Expo 原生目录只排除 `apps/mobile-app/android` / `apps/mobile-app/ios`，其他位置的同名业务目录仍保留。各应用的 `.env.example` 单独从模板复制，不复用本地环境配置。
2. 改写目标目录的 `package.json` 字段：`name=$APP_NAME`、`version=0.0.1`。
3. 从各应用的 `.env.example` 生成各自本地配置；API 的 `APP_NAME` 使用新项目名，不把 API 配置复制到前端。
4. `git init -b main`，将源仓库本地配置的 `user.name` / `user.email` 设置到新仓库，再创建一条 `chore: bootstrap from nest-scaffold` 提交；不复用原提交历史。
5. 输出后续手动步骤：安装依赖、检查各应用 `.env`，再启动 Compose、执行迁移及可选 seed、启动开发服务。

约束：

- 脚本根据自身位置定位仓库根；可以从任意目录调用脚本的绝对路径。
- 复制使用上述固定排除项，不读取 `.gitignore` 来决定复制范围，也不是通用敏感文件扫描。以 `.env` 或 `.env.` 之外的名称保存的凭据、额外工具目录和项目资料不保证被排除；运行前清理或明确隔离这些内容，不能假定“未跟踪文件”不会进入新项目的初始提交。
- 自动改名仅覆盖根包名及服务端 `APP_NAME`；工作区的 `@nest-scaffold/*` 包名、依赖引用、筛选脚本、Expo `name` / `slug` / `scheme` 和前端显示标题仍保留模板值。需要产品化命名时成组更新相应引用；原生包标识和签名配置另行设置。
- 源仓库必须已按 [Git 身份约定](../docs/development/git-commit.md#身份与隐私)设置仓库本地 `user.name` / `user.email`；缺失时在创建目标前失败，不读取全局身份作为回退、不生成占位身份，也不输出身份值。
- 开始前拒绝会覆盖 Git 仓库、工作树、初始化模板、索引、对象路径或发现范围的环境变量（如 `GIT_DIR`、`GIT_WORK_TREE`、`GIT_TEMPLATE_DIR`、`GIT_INDEX_FILE`、`GIT_OBJECT_DIRECTORY`），以及命令级 `GIT_CONFIG` / `GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*`、`GIT_AUTHOR_*` / `GIT_COMMITTER_*` 身份覆盖和可能向外部文件记录命令参数的 `GIT_TRACE*`；只提示变量名，不输出值。请从无这些覆盖变量的终端执行，源仓库的 Git 配置文件与本地身份配置不被改写。
- 初始提交失败会以非零状态退出，不显示创建成功；已经生成的目录保留，需检查失败原因后手动处理，不会自动删除或覆盖。
- macOS 与 Linux 都兼容（兼容 `sed -i` 差异）。
- 需要 `python3`（用于路径校验与修改 JSON）。

回归测试：`pnpm --dir apps/server test:unit src/__tests__/bootstrap.unit-spec.ts`。仅使用临时目录中的合成配置与 Git 仓库，验证 rsync 和 tar 两种复制路径、隐私过滤、源内目标与符号链接拒绝、Git 环境覆盖拒绝、身份继承及缺失、提交失败和启动提示顺序，不联网，也不读取真实环境文件或 Git 身份；机器没有 rsync 时只跳过该路径，tar 路径仍会验证。

## new-module.sh

在已有 nest-scaffold 项目内生成一个新业务模块。

```bash
bash scripts/new-module.sh <feature-kebab-singular> [feature-kebab-plural]
```

参数：

- `<feature-kebab-singular>`：kebab-case 单数形式（如 `user-profile`）。
- `[feature-kebab-plural]`：kebab-case 复数形式（默认 `<singular>s`，如 `user-profiles`）。**用于表名 / 路由 / Schema 变量**。

行为：

1. 自动定位工作区及 `apps/server` 后端应用；可从根目录或后端子目录调用，源码始终生成到服务端应用内。
2. 从 `scripts/templates/feature-module/` 拷贝并替换占位符（用途见模板内具体上下文）：
   - `__feature__` → 单数 kebab（`user-profile`），用于文件名/路径/字符串
   - `__features__` → 复数 kebab（`user-profiles`），用于路由/表名字符串
   - `__Feature__` → 单数 PascalCase（`UserProfile`），用于类名
   - `__featureCamel__` → 单数 camelCase（`userProfile`），用于属性/参数/局部变量
   - `__featuresCamel__` → 复数 camelCase（`userProfiles`），用于 Drizzle Schema 变量名
   - `__FEATURE__` → 单数 UPPER_SNAKE（`USER_PROFILE`），用于常量
   - 替换顺序：先 Camel 占位符，再 Pascal/UPPER，再 kebab 复数 → kebab 单数（避免前缀互吃）
3. 生成：
   - `apps/server/src/app/api/<feature>/`（controller / service / module / dtos / entities / **tests**）
   - `apps/server/src/app/repositories/<feature>.repository.ts`
   - `apps/server/src/database/mysql/schemas/<features>.schema.ts`（如不存在，从 `scripts/templates/schema.ts.tpl` 生成桩）
4. 输出后续手动步骤（先进入后端目录，再更新 schemas/index.ts、api.module.ts、db:generate:mysql + db:migrate:mysql、补 TODO、跑测试）。

该脚本只生成 MySQL 服务端骨架，不生成共享接口、管理页面或手机路由。模板的 SQL 表名直接使用传入的复数名；复数含 `-` 时，补表定义时应按[数据库命名规范](../docs/development/database.md#schema-与迁移)调整为小写下划线表名，HTTP 路由仍可保留 kebab-case。PostgreSQL 项目还需调整 Schema、仓储和方言导入。

生成的更新 DTO 会拒绝空对象及只有未知字段的对象；追加仅更新字段时，在非空校验之前调用 `.extend()`。游标排序仅接受表中非空的字符串、数字、日期列，页码排序仍保留全部列。

生成的集成测试默认是**明确失败的安全占位用例**，不导入完整应用、不连接服务。完成临时依赖、测试凭据和资源清理后，再以真实行为断言替换占位用例；不要改成 skip/todo 或加载本地 `.env`。参考[测试安全边界](../docs/development/testing.md#测试安全边界)和[现有隔离集成测试](../apps/server/src/app/api/demo/__tests__/demo-cursor.integration-spec.ts)。

生成器回归测试：`pnpm --dir apps/server test:unit src/__tests__/new-module.unit-spec.ts`。测试仅在临时目录生成模块，不连接数据库或读取本地环境配置。

约束：

- 输入必须是合法 kebab-case（`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`）。
- 同名模块/仓储已存在时拒绝执行（保护）。
- 默认复数推导是简单加 `s`，对 `category`→`categorys` 等不规则名词需手动传第 2 参数（`category categories`）。

## setup-github.sh

为当前仓库一次性启用 GitHub 工程约束（GitHub Flow 所需的平台设置），幂等可重跑；该脚本会修改远端仓库设置，按团队需要手动执行：

```bash
bash scripts/setup-github.sh
```

做三件事（等价于网页 Settings 手动配置）：

1. **main 分支保护**：必须走 PR、必需状态检查 `ci`/`docker`、管理员同样受限（enforce_admins）、禁强推/删除；
2. **仅 Squash merge**：squash 提交标题取 PR 标题、正文取 PR 描述（禁用 merge commit 与 rebase 合并）；
3. **auto-delete head branches**：PR 合并后自动删除远端分支。

前置与约束：

- 需要 `gh` 已登录；脚本先核验并显示账号与目标仓库，始终请求一次继续确认。账号与仓库 owner 不一致时额外提示（组织仓库属正常），执行者须有 admin 权限；
- 分支保护将必需审核批准数设为 `0`，要求通过 PR 和 `ci` / `docker` 检查，不等于已经配置人工审查批准门槛。需要审核人数或其他组织规则时另行设置；
- `origin` 必须是 SSH 形式 `git@github.com:<owner>/<repo>.git`；
- 必需检查 `ci`/`docker` 要等 CI 至少跑过一次才会在网页设置里可见，新仓库先推送一次代码即可（不影响配置生效）。

## 故障排查

- **`错误: 未找到仓库根目录`**：脚本需要定位包含 `apps/server/src/app/` 的工作区。请进入项目根再跑。
- **替换后的代码 lint 报错**：先 `pnpm lint`，常见是 import 顺序与 prettier 行尾。
- **`db:generate:mysql` 未检测到新表**：确认 `apps/server/src/database/mysql/schemas/index.ts` 已 `export * from './<features>.schema'`。
