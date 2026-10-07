# Nest Scaffold

面向中小型项目的全栈脚手架：NestJS API、React 管理后台和 Expo 手机前端，使用 pnpm workspace 统一管理。

集成常用基础设施、共享接口契约和可联调的 Demo 增删改查示例，为新项目提供清晰、可维护的起点。默认保持简单，按实际需求扩展。

## 主要能力

- **后端 API**：NestJS + TypeScript，Controller / Service / Repository 分层，Drizzle ORM、MySQL / PostgreSQL、Redis 缓存与分布式锁、BullMQ 队列、S3 兼容 Storage。
- **管理后台**：React + TypeScript + Vite，Zustand、TanStack Router / Query / Table / Form、Zod 与 Tailwind CSS；基础组件按 shadcn/ui 的本地组件方式维护。
- **手机前端**：Expo + React Native + TypeScript，Expo Router、TanStack Query 与 Zustand。
- **共享代码**：公开 API 的 Zod schema / TypeScript 类型，以及基于 fetch 的 API 客户端；前端不依赖 Nest 或数据库实现。
- **测试与构建**：Vitest 单元测试、真实依赖集成测试、API 与管理后台生产镜像 E2E；各应用独立构建与类型检查，移动端构建导出 bundle。
- **开发与部署**：项目及 API 模块生成脚本、本地 Docker Compose、API / 管理后台 Dockerfile 和 GitHub Actions CI。

## 设计取舍

默认使用 MySQL 和单机 Redis；PostgreSQL、Redis 哨兵按需选用，不引入 Redis Cluster 或预置分片架构。

当前 Demo 包含管理后台的新增、详情、编辑、删除、筛选与排序分页，以及手机端只读列表和详情。登录、会话、权限及资源归属校验尚未实现，Demo 接口只在开发 / 测试环境注册，生产环境不开放。API 与管理后台采用 Docker 部署；Expo 原生应用独立构建、签名和发布。CI 不推送镜像或发布应用，CD 需自行配置后启用。

## 开始使用

开发环境需要 Node.js >= 24、pnpm >= 11，以及用于本地基础设施和容器测试的 Docker。具体版本以根 [package.json](package.json) 和各应用的 `package.json` 为准。

- [快速开始](docs/getting-started.md)：安装、各应用配置与本地联调。
- [架构说明](docs/development/architecture.md)：三端目录与共享边界。
- [前端开发](docs/development/frontends.md)：管理后台、手机端与 API 连接。
- [开发文档](docs/README.md)：接口、数据库、测试与工程约定。
- [工具脚本](scripts/README.md)：生成新项目和 API 业务模块。
- [部署说明](docs/deployment.md)：Docker 生产部署与移动端发布边界。

本页仅作项目介绍，操作步骤与技术细节统一在 `docs/` 维护；协作约定见 [AGENTS.md](AGENTS.md)。
