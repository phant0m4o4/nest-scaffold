# Git 约定

## 提交格式

```text
type(scope): subject

中文说明：为什么改、有什么影响。
```

- `type` 与可选的 `scope` 使用英文小写；标题简短，建议不超过 50 字符。
- 常用类型：`feat` 新功能、`fix` 修复、`refactor` 重构、`docs` 文档、`test` 测试、`chore` 维护、`build` 构建、`ci` 持续集成配置。
- 正文如有则用中文；不兼容变更用 `BREAKING CHANGE:` 说明迁移要求。
- 一次提交处理一个主题，相关测试、配置、模板和文档一起提交。
- 可用 `pnpm commit` 交互式填写，也可直接使用 `git commit`。

## 身份与隐私

- 使用已确认的 GitHub 用户名和该账号的 noreply 邮箱，不使用个人真实姓名或邮箱。
- 在仓库级设置 `user.name` / `user.email`，不修改全局身份；已有配置不明确时先向维护者确认。
- `origin` 使用 SSH 地址，例如 `git@github.com:<owner>/<repo>.git`；沿用已有认证方式，不复制私钥或从私钥内容推断身份。
- 若项目使用独立 SSH key，应保持私钥目录被忽略；否则沿用系统 SSH 配置。
- `.env`、密钥、真实凭据、本机信息及 AI 署名/会话链接不得进入提交、合并请求或报告。提交前检查暂存差异；详见[工程底线](engineering-conventions.md)。

## 分支与合并

默认采用 `main` + 短期工作分支的 [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)，不设置长期 `dev` 分支。`main` 应保持可发布，但不代表它始终等于生产环境当前运行的版本，也不要求每次合并都上线。

- 不直接向 `main` 推送，也不强推 `main`。使用短期工作分支，通过 PR（合并请求）合入。
- 分支名表达目的，例如 `fix/cache-ttl` 或 `docs/development-guide`；工具有前缀要求时遵循工具约定。
- 提交前运行相关检查；代码推送前在仓库根通过 `pnpm lint:check`、`pnpm typecheck`、`pnpm build` 和 `pnpm test`。完整测试需要 Docker；单测覆盖率另由 `pnpm test:unit:cov` 检查。纯文档变更按[开发流程](workflows.md)核对内容、链接、命令与格式，无需重跑业务测试。
- 合并前确保 `ci` / `docker` 检查通过，按仓库设置使用 Squash merge（将分支提交压成一条）；PR 标题采用提交格式。
- 合并后清理已完成的分支；删除分支或改写历史前确认没有未合并工作。
- 代码审查结论与发布审批由负责人决定，AI 不代批。AI 只有在用户明确要求时才提交；提交授权不等于推送或合并授权。

PR 描述写清目的、实际验证和兼容性影响即可。高风险改动补充失败场景、上线与恢复方案，详见[开发流程](workflows.md)。不要求固定的多份验收产物。

### 日常 GitHub Flow

以下是流程参考，不代表授权 AI 执行提交、推送、创建 PR 或合并。执行前确认工作区状态；不要为切换分支丢弃未提交内容。

```bash
# 从最新 main 新建短期分支
git switch main
git pull --ff-only
git switch -c feature/user-profile

# 只暂存本次改动，检查后提交
git add <本次修改的文件>
git diff --cached
pnpm commit

# 本地检查通过后推送
pnpm lint:check
pnpm typecheck
pnpm build
pnpm test
git push -u origin feature/user-profile

# gh 或网页二选一；创建后确认 PR 标题符合提交格式
gh auth status
gh pr create --fill
gh pr checks --watch
gh pr merge --squash

# 确认合并完成后同步 main；本地分支仅在没有未合并工作时删除
git switch main
git pull --ff-only
git branch -d feature/user-profile
```

评审期间继续向同一工作分支推送。确需 rebase 改写历史时，先确认授权及协作者状态，只对工作分支使用 `--force-with-lease`，禁止强推 `main`。Squash 合并后 `git branch -d` 可能因提交历史不同而拒绝删除；先核对 PR 已合并及分支内容，不直接改成强制删除。

### 何时引入长期 dev

只有项目确有共享测试环境集中联调、验收后批次发布，并需要同时继续下一批开发的需求时，才考虑长期 `dev`：短期工作分支通过 PR 合入 `dev`，验收后再通过发布 PR 合入 `main`。它是可选方案，不是脚手架的默认流程，也不能代替发布审批或数据隔离。

引入前须同步调整，而不是只创建一个分支：

- CI 覆盖 `dev` 与 `main` 的 push 和相关 PR；两个长期分支都要求检查通过、经 PR 合并，并禁止强推和删除，避免合并后自动清理掉 `dev`。
- 短期工作分支仍可 Squash；长期 `dev → main` 的发布合并及 `main → dev` 的修复回流采用保留历史的 Merge，不反复 Squash。生产修复合入 `main` 后，及时通过 PR 同步回 `dev`，避免两条分支持续分叉。
- 调整仓库合并策略与设置脚本。当前 `scripts/setup-github.sh` 只保护 `main`，仅允许 Squash，并开启合并后自动删分支，不能原样用于长期双分支方案。
- 明确测试与生产的部署目标，隔离数据库、Redis、Storage 和凭据；不能因分支不同就认为数据已经隔离，详见[测试安全边界](testing.md#测试安全边界)。

### 合并与生产发布

若只是希望控制上线时间，继续使用默认分支策略，优先选择显式手动发布，不为此增加 `dev`。发布流程仍须校验目标提交的 CI 结果，并固定提交与镜像 digest，不能绕过检查直接发布任意版本。

当前仓库只有 CI，不会发布镜像或部署应用；[部署说明](../deployment.md)中的 CD 尚是未启用模板，其触发方式为 `main` 的 push CI 成功后进入发布流程。需要手动发布的项目，应先调整该模板的触发与校验逻辑再启用，不能把本节约定理解成现有模板已经改为手动发布。合并、发布及远端配置变更分别确认授权。

## 工具与仓库设置

| 操作                           | 工具                                                      |
| ------------------------------ | --------------------------------------------------------- |
| 提交、推送、拉取、查看历史     | 原生 `git`，沿用仓库的 SSH 认证                           |
| 创建 PR、查看检查、Squash 合并 | `gh` 或网页                                               |
| 分支保护、合并方式、自动删分支 | `scripts/setup-github.sh`（调用 `gh api`）或网页 Settings |
| 最终审查结论、发布审批         | 负责人确认；AI 可辅助检查，不代替审批                     |

- 使用 `gh` 前先执行 `gh auth status`，确认操作账号是维护者授权的账号，与仓库使用身份一致；不要因为已登录就默认可修改远端。
- 新仓库可选择运行 `bash scripts/setup-github.sh` 设置分支保护、合并方式及分支清理。该脚本会修改 GitHub 设置，执行前确认目标仓库与权限。详见[脚本说明](../../scripts/README.md)。
- 若接入自动部署，合并可能触发发布，不能把“合并”当作纯文档操作。

### PR 门禁清单

下表适用于默认的 `main` + 短期工作分支，也是现有设置脚本的配置效果；采用长期 `dev` 时须先按上文调整。本地存在脚本不代表远端已启用，实际状态需在目标仓库核对。脚本需已登录的 `gh` 账号具有仓库 admin 权限，也可手动配置：

| 设置                        | 约定值                                                 | 网页位置                            |
| --------------------------- | ------------------------------------------------------ | ----------------------------------- |
| main 必须通过 PR 合并       | 开启；脚本默认 required approvals 为 0，团队可按需增加 | Settings → Branches → main 保护规则 |
| 必需状态检查                | `ci`、`docker` 全部通过                                | 同上                                |
| 管理员绕过、强推、删除 main | 管理员同样受限，禁止强推与删除                         | 同上                                |
| 合并方式                    | 仅 Squash merge；提交标题取 PR 标题，正文取 PR 描述    | Settings → General → Pull Requests  |
| 合并后清理远端分支          | Automatically delete head branches 开启                | 同上                                |

[CI 配置](../../.github/workflows/ci.yml)在 `main` 的 push 或 PR 时运行，其中 PR 不限制目标分支：`ci` 负责全工作区只读静态检查、类型检查、构建、共享包单测、API 单元覆盖率和集成测试，`docker` 负责构建并验证 API 与管理后台两个生产镜像；它不推送镜像或部署应用。手机端构建只导出 bundle / 资源，不含原生签名、真机测试或商店发布。检查名可能要等首次 CI 运行后才出现在网页候选列表中，脚本可直接配置这些名称。验证范围见[测试规范](testing.md)。
