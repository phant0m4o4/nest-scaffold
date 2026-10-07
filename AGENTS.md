# 项目入口与开发约定

Nest Scaffold 是面向中小型项目的全栈脚手架，使用 pnpm workspace 管理 `apps/server`（NestJS）、`apps/admin-frontend`（React 管理后台）和 `apps/mobile-app`（Expo 手机前端）。默认 MySQL、Redis 单机，按需选择 PostgreSQL 或 Redis 哨兵，不引入 Redis Cluster。

项目文档统一维护在 [docs/README.md](docs/README.md)，开发者和 AI 参考同一份内容。根据任务阅读相关章节，不需要加载 skill 或每次通读全部规范。

## 文档入口

- 前端与共享接口：[前端开发](docs/development/frontends.md)。
- 安装与本地运行：[快速开始](docs/getting-started.md)。
- 生产环境与发布：[部署说明](docs/deployment.md)。
- 生产数据保护：[备份与恢复](docs/backup-and-restore.md)；文档示例不代表授权执行生产操作或启用定时任务。
- 日常开发与验证：[开发流程](docs/development/workflows.md)、[测试规范](docs/development/testing.md)。
- 目录与模块边界：[架构说明](docs/development/architecture.md)；其他主题从[文档索引](docs/README.md)查阅。

工作区命令以根 [package.json](package.json) 为准，应用依赖以各自 `package.json` 为准；使用 pnpm 和一个根锁文件。`pnpm test` 运行 API 全部测试、管理后台镜像测试及共享包单测，需要 Docker；日常单测使用 `pnpm test:unit`。

## 工作方式

- 面向中小型项目，选择满足当前需求的简单实现，不增加未经要求的功能或抽象。
- 服务端应用运行时除日志外禁止任何本地文件写入；上传、导出、生成文件等统一使用 S3 兼容 Storage，不允许临时落盘或失败时回退本地。独立备份 / 恢复另行授权，不作为应用落盘的例外。完整边界见[文件写入与 Storage](docs/development/engineering-conventions.md#文件写入与-storage)。
- API 与管理后台生产部署采用 Docker，默认单台服务器上的 Compose；CI/CD 使用 GitHub Actions 与 GHCR。Expo 原生应用独立构建、签名和发布，不受服务端 Docker 部署约定约束。配置和启用步骤见[部署说明](docs/deployment.md)。
- 应用环境变量分别维护；服务端密钥不得进入前端。手机本地偏好和安全凭据按[前端开发](docs/development/frontends.md)管理，上传业务文件仍使用 S3 兼容 Storage。共享包仅承载公开契约与客户端能力，不暴露服务端配置、数据库结构或 Nest 实现。
- 代码风格、架构设计、技术选型、测试和部署优先采用当前行业主流、成熟且持续维护的实践；涉及版本、弃用状态或推荐方案时核对最新官方资料与项目实际版本。遵循[技术选型与现代实践](docs/development/engineering-conventions.md#技术选型与现代实践)，兼顾安全、兼容性与维护成本。
- 先读相关代码再修改；只处理任务范围，保留用户已有的无关改动。
- 不确定会影响范围或结果时先说明，不擅自替用户决定。
- 修复缺陷时保留必要回归测试，按[开发流程](docs/development/workflows.md)验证；只报告实际执行结果和已知限制。
- 用清楚、简短的中文沟通，不为普通改动固定安排多轮审查或多份报告。

## 安全与交付

- 使用 pnpm；命名和分层遵循[编码规范](docs/development/coding-standards.md)，不要通过跳过测试或降低门槛掩盖问题。
- 不泄露或提交真实环境变量、私钥、凭据、个人信息、本机路径及 AI 署名/会话链接。详见[安全与工程底线](docs/development/engineering-conventions.md)。
- 测试只操作隔离的临时资源，禁止写入生产数据、调用外部真实写入接口或操作区块链主网；不得使用真实生产凭据或主网私钥。运行前核实目标与副作用，无法确认隔离时停止相关测试，不以“验证功能”绕过限制。详见[测试安全边界](docs/development/testing.md#测试安全边界)。
- 删除数据、改写历史或修改外部服务前确认授权与具体范围。
- 不自动提交或推送；用户要求本地提交不代表同意推送、合并或发布。沿用已确认的仓库身份，详见[Git 约定](docs/development/git-commit.md)。
- 不代替负责人作代码审查批准或发布审批。
