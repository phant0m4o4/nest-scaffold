# Git 规范：提交（Commitizen 风格）、分支与推送

## 强制要求

1. 第一行必须是 `type(scope): subject` 或 `type: subject`。**type 头部不能省略**。
2. **`type` 与 `scope` 必须英文**，禁止中文。
3. **`body` 必须中文**（如有）。
4. `subject` 与 `footer` 可中可英。
5. 推荐使用 `pnpm commit`（已配 commitizen + cz-conventional-changelog）。

## 完整格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `subject` ≤ 50 字符，动词开头，末尾不加句号。
- `body` 与 header 之间空一行。
- `footer` 用于关闭 issue（`Closes #123`）或 `BREAKING CHANGE`。

## type 取值

| type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响运行） |
| `refactor` | 重构（既非新功能也非修复） |
| `perf` | 性能优化 |
| `test` | 测试新增/修复 |
| `build` | 构建或外部依赖变更 |
| `ci` | CI 配置变更 |
| `chore` | 其他不改源/测试的变动 |
| `revert` | 回滚 |

## scope 选取建议

参考实际业务域或模块：`order`、`user`、`auth`、`cache`、`queue`、`db`、`logger`、`api`、`config`、`infra`、`build`、`test`、`docs` 等。**纯英文**。

## 正确示例

无 body：

```
feat(order): Add order list pagination
fix(login): Fix redirect error after login
docs(readme): Update project installation instructions
```

带 body：

```
feat(order): Add order list pagination

实现了订单列表的分页查询，支持游标分页和传统分页两种方式。
新增了分页参数验证和错误处理逻辑。

Closes #123
```

带 BREAKING CHANGE：

```
fix(auth): Fix token expiration issue after login

修复了登录成功后 token 立即过期的问题，将 token 有效期改为 24 小时。
同时优化了 token 刷新机制。

BREAKING CHANGE: Token storage changed from localStorage to httpOnly cookie
```

## 错误示例

```
# ❌ 缺少 type
Add user list query feature

# ❌ type 中文
功能(用户): Add user list query feature

# ❌ scope 中文
feat(用户管理): Add user list query feature

# ❌ body 英文
feat(user): Add user list query feature

Implement user list query functionality with pagination support.
```

## body 中英对照（写 body 时参考）

| 英文 | 中文 |
|------|------|
| Implement ... | 实现了 ... |
| Fix ... | 修复了 ... |
| Update ... | 更新了 ... |
| Refactor ... | 重构了 ... |
| Add unit tests for ... | 添加了 ... 的单元测试 |
| Optimize ... | 优化了 ... |

## 工作流

1. 暂存变更：`git add ...`
2. `pnpm commit` 启动 commitizen 交互式流程：
   - 选 type（英文）
   - 输 scope（英文，可空）
   - 输 subject（中/英任选，简短）
   - 输 body（中文，可空）
   - 是否 BREAKING CHANGE
   - 关联 issue（可空）
3. commitizen 会自动拼装并提交，符合规范。

## 分支规范（GitHub Flow）

- **`main` 受保护，禁止直推**：一切变更走短命工作分支，经 PR 合入 `main`。分支命名 `<type>/<kebab-topic>`（如 `feature/pgsql-support`、`refactor/zod-migration`），`type` 与上方提交 type 表一致。
- **PR 合并的前提是 CI 全绿**（分支保护 required status checks：`ci` 与 `docker`），`main` 永远处于可部署状态。
- 合并方式用 **Squash merge**（一个 PR 压成 main 上一个提交，线性历史）；**PR 标题按本规范书写**，它就是合入 `main` 的提交标题。
- **有风险改动的 PR 描述须含四件验收产物**（循环 review 记录、自动化测试清单与覆盖对照、人工验收记录、审核导读），缺任一件审核人可直接退回；详见 [task-acceptance.md](task-acceptance.md)。审查对照 [engineering-conventions.md](engineering-conventions.md)。纯机械改动可走轻量版说明。
- 工作分支**用完即清**：PR 合并后立即删除远端与本地分支及对应 worktree（GitHub 开启 auto-delete head branches 后远端自动删）。
- **禁止对 `main` 强推**；工作分支在 PR 评审期间可 rebase/强推自己。
- PR 的创建/检查/合并可用 `gh` CLI 或网页；工具分工与 gh 命令见下方「工具分工与 gh 用法」。

## 提交与推送流程

- **原子提交**：一次提交只做一件事；因本次改动而需要同步的文档/模板/配置放进同一个提交，不留"文档稍后补"的尾巴。
- **推送前验证**：`pnpm lint && pnpm build && pnpm test` 必须全绿（改动涉及 e2e 面时加 `pnpm test:e2e`），工作区不留未跟踪的临时文件——别把红的推给 CI。
- 流程：开分支 → 提交 → 推送分支 → 创建 PR → CI 全绿 → Squash merge → 删除本地分支。
- 身份与隐私要求（SSH key、noreply 署名、提交内容不得含本机/个人信息）见仓库根 [CLAUDE.md](../../../../CLAUDE.md) 规则 A。

## 工具分工与 gh 用法

| 操作 | 工具 |
|------|------|
| 提交 / 推送 / 拉取 / 看历史（git 数据操作） | 原生 `git`（SSH key 认证），**不用 gh** |
| PR 创建 / 查看检查 / Squash 合并 | `gh` CLI 或 GitHub 网页 |
| 仓库设置（分支保护 / 合并方式 / auto-delete） | `gh api` 或网页 Settings |
| 代码审查判断、Environments 发布审批 | **必须人工**（网页），不得由代理代批 |

`gh` 使用前置：**每次使用前先核验登录账号与仓库署名账号一致**，不一致立即停止：

```bash
gh auth status
```

PR 全流程的 gh 版本（网页操作的等价替代）：

```bash
gh pr create                     # 标题符合提交规范；描述含 task-acceptance 四件产物（或链到 reports/.../验收报告.md）
gh pr checks --watch             # 盯 required checks（ci / docker）直到出结果
gh pr merge --squash --delete-branch   # CI 全绿且审核通过后 Squash 合并并删除远端分支
```

## 验证清单

提交前过一遍：

- [ ] 首行有 `type(scope): subject` 或 `type: subject`
- [ ] `type` 与 `scope` 全英文小写
- [ ] `subject` ≤ 50 字符、动词开头、末尾无句号
- [ ] 如有 `body`，使用中文
- [ ] 不在标题里包含敏感信息（密码、token、内部 URL）
- [ ] 本次提交只做一件事，连带的文档/模板已在同一提交内
- [ ] `pnpm lint && pnpm build && pnpm test` 全绿后再推送
- [ ] 变更经 PR 合入（Squash merge，PR 标题符合提交规范），未直推 `main`
- [ ] 工作分支合并后已删除本地/远端分支（仓库只剩 `main`）
