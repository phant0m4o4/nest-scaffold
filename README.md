# Nest Scaffold

面向中小型项目的 NestJS 后端脚手架。

集成常用基础设施、业务模块示例和测试工具，为新项目提供清晰、可维护的起点。默认保持简单，按实际需求扩展。

## 主要能力

- **业务开发**：Controller / Service / Repository 分层，提供模块生成脚本和 CRUD、分页示例。
- **数据访问**：Drizzle ORM，支持 MySQL 与 PostgreSQL，包含数据库迁移、事务和开发数据初始化工具。
- **缓存与任务**：基于 Redis 的缓存、分布式锁，以及 BullMQ 异步任务队列。
- **接口与日志**：zod 参数校验、统一响应与异常处理、国际化校验文案、Pino 结构化日志。
- **测试与构建**：Vitest 单元测试、真实依赖集成测试、生产镜像 E2E；SWC 编译与 TypeScript 类型检查。
- **开发与部署**：项目及模块生成脚本、本地 Docker Compose、生产 Dockerfile 和 GitHub Actions CI。

## 设计取舍

默认使用 MySQL 和单机 Redis；PostgreSQL、Redis 哨兵按需选用，不引入 Redis Cluster 或预置分片架构。

这是业务项目的开发起点，不是完整的业务系统。登录、权限及资源归属校验需按项目需求实现；生产只采用 Docker 部署，提供基于 GitHub Actions 与 GHCR 的 CI/CD 配置说明，CD 需自行配置后启用。

## 开始使用

开发环境需要 Node.js >= 24、pnpm >= 11，以及用于本地基础设施和容器测试的 Docker。具体版本以 [package.json](package.json) 为准。

- [快速开始](docs/getting-started.md)：安装、本地运行与调试。
- [开发文档](docs/README.md)：架构、接口、数据库、测试与工程约定。
- [工具脚本](scripts/README.md)：生成新项目和业务模块。
- [部署说明](docs/deployment.md)：Docker 生产部署与 GitHub CI/CD。

本页仅作项目介绍，操作步骤与技术细节统一在 `docs/` 维护；协作约定见 [AGENTS.md](AGENTS.md)。
