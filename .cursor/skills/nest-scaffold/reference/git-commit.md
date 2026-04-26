# Git Commit 规范（Commitizen 风格）

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

## 验证清单

提交前过一遍：

- [ ] 首行有 `type(scope): subject` 或 `type: subject`
- [ ] `type` 与 `scope` 全英文小写
- [ ] `subject` ≤ 50 字符、动词开头、末尾无句号
- [ ] 如有 `body`，使用中文
- [ ] 不在标题里包含敏感信息（密码、token、内部 URL）
