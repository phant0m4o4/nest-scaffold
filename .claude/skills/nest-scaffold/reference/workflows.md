# 开发生命周期工作流

按任务类型划分的端到端流程——从拿到需求到变更合入 `main`（乃至自动部署）。本文只写"流程与顺序"，具体规范由各 reference 文档承载，避免两处维护。

## 通用骨架（所有场景共享）

```
准备 → 实施 → 验证 → 交付
```

**准备**（所有场景相同）：

```bash
git checkout main && git pull
git checkout -b <type>/<kebab-topic>   # type 与提交规范一致：feature/ fix/ refactor/ docs/ chore/ ...
```

**验证**（所有场景相同）：

```bash
pnpm lint && pnpm build && pnpm test   # 涉及 e2e 面时加 pnpm test:e2e
```

**交付**（所有场景相同，详见 [git-commit.md](git-commit.md)）：

```bash
git add <files> && pnpm commit         # 原子提交，连带的文档/迁移/模板进同一提交
git push -u origin <branch>
gh pr create --fill                    # 或打开推送输出的网页链接；标题符合提交规范
gh pr checks --watch                   # ci / docker 全绿
gh pr merge --squash --delete-branch   # 或网页 Squash merge；合并即触发 CD(如已配置)
git checkout main && git pull && git branch -d <branch>
```

下文各场景只写**实施**部分的差异。

---

## 场景 1：新项目（bootstrap）

1. 生成项目：`bash .claude/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>`（详见 [scripts/README.md](../scripts/README.md)）。
2. 本地跑通：`pnpm install` → `cp .env.example .env` → `docker compose up -d` → `pnpm db:migrate:mysql` → `NODE_ENV=development pnpm db:seed:mysql` → `pnpm start:dev`。
3. 建远端仓库并推送 `main`（remote 用 SSH 形式）。
4. 启用工程约束（一次性）：`bash .claude/skills/nest-scaffold/scripts/setup-github.sh`——gh 自动完成分支保护（required checks：`ci`/`docker`、禁直推/强推）、仅 Squash merge、auto-delete head branches（详见 [scripts/README.md](../scripts/README.md)；也可按 CLAUDE.md 规则 A.4 网页手动配置）。
5. 按需添加 CD（README「CI / CD」的方案 A/B 示例）。

## 场景 2：新功能 / 新业务模块

准备开 `feature/<topic>` 分支后：

1. 生成骨架：`bash .claude/skills/nest-scaffold/scripts/new-module.sh <domain-kebab>`（或按 [module-development.md](module-development.md) 手写）。
2. 数据库：定义 schema → `pnpm db:generate:mysql --name=<kebab>`（务必带 `--name`）→ **检查生成的 SQL** → `pnpm db:migrate:mysql`；需要基础数据用 `--custom --name=<n>`（详见 [database.md](database.md)）。
3. 实现：Repository 确认表名与特殊查询 → Service 业务逻辑 → Controller/DTO 遵循 [rest-api.md](rest-api.md)（zod DTO、param DTO、`Entity.create()` 净化）。
4. 注册：`api.module.ts` 的 `imports` 加入新模块。
5. 测试：Service 单测（`useMocker` mock 仓储）+ 按需 e2e（testcontainers），写法见 [testing.md](testing.md)。
6. 同步受影响的文档（模块 README / skill reference）。
7. 验证 → 交付（迁移文件随本次 PR 一起提交）。

## 场景 3：修改既有功能

准备开 `refactor/<topic>` 或 `feature/<topic>` 分支后：

1. **先读后改**：相关 controller/service/repository 与文档，确认影响面（接口契约是否变化、谁在调用）。
2. **目标驱动**：先改/补测试表达预期行为，再改实现，改动前后测试都过。
3. 接口/DTO/schema 变化时：同步数据迁移、模板、文档——放进同一提交。
4. **外科手术式改动**：不顺手重构无关代码；因本次改动失去引用的孤儿要清掉。
5. 验证 → 交付。

## 场景 4：修 Bug

准备开 `fix/<topic>` 分支后：

1. **先写复现测试**（红）——写不出复现说明还没定位到根因，回到排查。
2. 修复到复现测试变绿；检查同类模式是否在别处重复（一并修或明确留待后续）。
3. 补边界用例，防止回归。
4. 验证 → 交付（PR 描述写清 **根因 → 修复方式**，不是只写现象）。

## 场景 5：数据库变更（独立的表结构 / 数据调整）

准备开 `feat/` 或 `fix/` 分支后，按 SKILL.md「工作流 B」执行（schema → generate → 检查 SQL → migrate → 迁移随代码提交）。额外注意：

- **破坏性变更**（删列/改类型/删表）必须在 PR 描述里显式声明,并确认生产迁移顺序安全（先兼容后清理，必要时拆多个 PR 分批上线）。
- 基础/默认数据一律走 `--custom` 数据迁移，不改 seed（seed 只是开发演示数据）。

## 场景 6：文档 / 配置变更

`docs/` 或 `chore/` 分支；同样走完整交付流程（PR 也会跑 CI，轻量改动同样受 main 保护约束）。与代码行为相关的文档改动，优先与代码变更放同一个 PR。
