# Nest Scaffold 文档

包含 NestJS API、React 管理后台和 Expo 手机前端的全栈脚手架，面向中小型项目：先用简单实现解决当前问题，不预置分片、复杂扩展层或固定的多轮验收流程。Redis 默认单机，最多支持哨兵。

这些文档供开发者和 AI 共同参考，不依赖特定工具或 skill。按任务阅读相关章节即可，无需每次通读全部文档。

## 技术栈

- pnpm workspace：`apps/server`、`apps/admin-frontend`、`apps/mobile-app` 与按职责拆分的共享包。
- API：NestJS + TypeScript，SWC 编译并执行类型检查。
- 管理后台：React + Vite、Zustand、TanStack Router / Query / Table / Form、Zod、Tailwind CSS，按 shadcn/ui 本地组件方式维护基础组件。
- 手机前端：Expo + React Native、Expo Router、TanStack Query、Zustand。
- Drizzle ORM，默认 MySQL，PostgreSQL 可选，表结构通过迁移维护。
- ioredis、BullMQ，提供缓存、分布式锁与队列能力。
- AWS SDK for JavaScript v3，按需使用 S3 兼容 Storage；本地通过 SeaweedFS 开发。
- zod 入参校验，nestjs-i18n 国际化，Pino 结构化日志。
- Vitest、Supertest、Testcontainers；ESLint、Prettier、Commitizen。

工作区命令以根 [package.json](../package.json) 为准，依赖以各应用和共享包的 `package.json` 为准，模块详细用法见[基础设施选用](development/infra-modules.md)。

## 从这里开始

- 安装、本地启动和调试：[快速开始](getting-started.md)。
- 管理后台、手机端与共享契约：[前端开发](development/frontends.md)。
- Docker 生产部署、GitHub CI/CD 与移动端发布边界：[部署说明](deployment.md)。
- 定时 / 按需备份、S3 等机外存储、故障恢复与演练：[备份与恢复](backup-and-restore.md)。
- 日常开发、验证和交付：[开发流程](development/workflows.md)。
- 了解目录、模块装配与构建配置：[架构说明](development/architecture.md)。
- 写代码前了解约定：[编码规范](development/coding-standards.md)与[安全和工程底线](development/engineering-conventions.md)。

## 按任务查阅

| 要做的事                       | 参考                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 新建项目或生成模块             | [工具脚本](../scripts/README.md)                                                                                                          |
| 选择代码风格、设计或技术方案   | [技术选型与现代实践](development/engineering-conventions.md#技术选型与现代实践)                                                           |
| 设计上传、导出或文件存储       | [Storage（读写与直传）](modules/storage.md)、[文件写入约束](development/engineering-conventions.md#文件写入与-storage)                    |
| 实现业务模块                   | [模块开发](development/module-development.md)                                                                                             |
| 设计接口、校验和分页           | [接口规范](development/rest-api.md)                                                                                                       |
| 新增表、仓储或数据库迁移       | [数据库](development/database.md)                                                                                                         |
| 使用缓存、锁、队列、日志或限流 | [基础设施选用](development/infra-modules.md)                                                                                              |
| 开发管理后台 / 手机端          | [前端开发](development/frontends.md)                                                                                                      |
| 增加或调整环境变量             | [配置说明](development/env-vars.md)、[API 环境变量模板](../apps/server/.env.example)、[前端变量](development/frontends.md#环境变量与联调) |
| 编写和运行测试                 | [测试规范](development/testing.md)                                                                                                        |
| 整理提交、创建合并请求         | [Git 约定](development/git-commit.md)                                                                                                     |

## 模块参考

- 数据库：[模块概览](modules/database.md)、[MySQL](modules/database-mysql.md)、[PostgreSQL](modules/database-pgsql.md)。
- Redis 能力：[缓存](modules/cache.md)、[分布式锁](modules/distributed-lock.md)、[队列](modules/queue.md)、[限流](modules/bottleneck.md)。
- 文件与对象：[Storage（读写与直传）](modules/storage.md)。
- 日志与文案：[日志](modules/logger.md)、[国际化](modules/i18n.md)。

## 维护方式

- 项目级约定放在 `development/`，模块 API、配置和示例放在 `modules/`，源码和测试目录不再重复维护 README。
- 脚本及代码模板放在 `scripts/`，不依赖 AI 工具目录。
- 修改目录、命令、配置或能力边界时，同时核对快速开始、架构、相关专题与示例；文档链接须能定位到当前文件和章节，未实现的能力明确标注。
- 根 [README.md](../README.md) 仅用于 GitHub 项目介绍，[AGENTS.md](../AGENTS.md) 维护简短开发约定；详细说明在本目录按主题维护。
- 普通改动在提交说明中记录做了什么、如何验证即可；需要长期保留的专项记录放在 [reports/](../reports/README.md)。
