# 快速开始

本页负责首次安装、本地启动与调试。生产环境请使用[部署说明](deployment.md)，不要直接照搬开发环境。

## 环境准备

- Node.js >= 24、pnpm >= 11；具体版本以 [package.json](../package.json) 的 `engines` / `packageManager` 为准。
- Docker 与 Docker Compose，运行前启动 Docker，并确保 `docker` 命令在 PATH 中。
- Nest CLI 等开发工具随项目依赖安装，不需要全局安装。

已有本仓库的工作副本时直接继续。需要生成独立新项目时，在脚手架根目录运行：

```bash
bash scripts/bootstrap.sh <target-dir> <app-name>
```

目标目录必须不存在，且不能位于脚手架目录内（例如可用 `../my-new-api`）。先按 [Git 身份约定](development/git-commit.md#身份与隐私)配置源仓库的本地提交身份；脚本沿用该身份初始化独立 Git 仓库，并基于 `.env.example` 生成本地 `.env`，不安装依赖、不启动服务、不执行迁移。随后进入目标目录；参数与敏感文件排除规则见[工具脚本](../scripts/README.md)。

## 首次启动

以下命令均在项目根目录执行。已有 `.env` 时保留原文件并对照模板补齐配置，不要再次复制覆盖。

```bash
pnpm install
# 仅在尚无 .env 时执行；bootstrap 已生成的项目跳过此步
cp .env.example .env
```

启动容器前检查 `.env` 中的应用名、数据库、Redis 连接与端口。以 [.env.example](../.env.example) 为唯一模板，字段含义见[配置说明](development/env-vars.md)。`NODE_ENV` 由启动命令传入，不写入 `.env`。

```bash
docker compose up -d
# 依赖服务就绪后应用迁移（表结构与基础数据）
pnpm db:migrate:mysql
# 可选：填充开发演示数据
NODE_ENV=development pnpm db:seed:mysql
pnpm start:dev
```

默认装配 MySQL；选择 PostgreSQL 时需切换应用模块与仓储实现，不能仅把迁移命令换成 `:pgsql`。迁移、seed 与切换说明见[数据库文档](development/database.md)。

`start:dev` 已设置 `NODE_ENV=development`，并监听代码与翻译资源。默认应用端口为 3000，开发环境队列面板为 `/queues`；实际端口以本地配置为准。

## 本地基础设施

[docker-compose.yml](../docker-compose.yml) 提供以下服务；所有宿主机端口仅绑定 `127.0.0.1`，数据库、Redis 的宿主机端口号可由环境变量调整：

| 服务           | 默认端口             | 用途                 |
| -------------- | -------------------- | -------------------- |
| MySQL 9        | 3306                 | 默认数据库           |
| PostgreSQL 18  | 5432                 | 可选数据库           |
| Redis 8        | 6379                 | 缓存、锁、队列       |
| SeaweedFS 4.47 | 8333（仅 127.0.0.1） | 本地 S3 兼容对象存储 |
| phpMyAdmin     | 8081                 | MySQL 管理界面       |
| pgAdmin        | 8082                 | PostgreSQL 管理界面  |
| phpRedisAdmin  | 8080                 | Redis 管理界面       |

不需要全部服务时可指定名称，例如 `docker compose up -d mysql redis`。这套 Compose 含开发用密码与管理界面，仅限可信本地环境，不要部署到生产或暴露到公网。

容器与数据卷分开管理：

| 命令                     | 作用                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `docker compose stop`    | 暂停服务，保留容器和数据卷                                                    |
| `docker compose start`   | 恢复已有容器                                                                  |
| `docker compose down`    | 删除容器和网络，保留数据卷                                                    |
| `docker compose up -d`   | 创建并启动服务；执行过 `down` 后使用                                          |
| `docker compose down -v` | 同时删除 Compose 数据卷，清空本地 MySQL / PostgreSQL / Redis / SeaweedFS 数据 |

日常停止用 `stop` 或 `down` 即可。只有明确要重置全部本地数据时才使用 `down -v`，先确认目标项目与备份；重建后重新执行迁移，按需 seed。升级数据库大版本需要按对应数据库的升级流程处理，不能把删卷当作数据迁移。

### 本地 S3 存储

有文件读写、生成或浏览器直传需求时，在业务模块显式导入 `StorageModule`，先按 [Storage 配置步骤](modules/storage.md#配置步骤)配置。模块导出 `StorageService` 和 [UploaderService](modules/storage.md#浏览器直传)，分别用于服务端读写和浏览器直传；默认 `AppModule` 不装配该模块。已有 `.env` 请按 `.env.example` 的 `STORAGE_*` 段补齐本地配置，不要覆盖原文件。

```bash
# 只启动对象存储；不会启动数据库或 Redis
docker compose up -d seaweedfs
docker compose logs -f seaweedfs
# 停止 / 恢复单个服务，保留文件
docker compose stop seaweedfs
docker compose start seaweedfs
```

Compose 固定使用 SeaweedFS 4.47 的 `mini` 模式，启动时创建 `STORAGE_S3_BUCKET` 指定的 bucket（默认 `nest-scaffold`）。`STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` 同时传给 SeaweedFS 以启用 S3 认证，示例值仅供开发；对象默认私有，不开放匿名访问。启动方式与初始化参数见 [SeaweedFS 官方说明](https://github.com/seaweedfs/seaweedfs/blob/4.47/README.md#quick-start)。

应用在宿主机运行时使用 `STORAGE_S3_ENDPOINT=http://127.0.0.1:8333`；应用容器加入同一 Compose 网络时使用 `http://seaweedfs:8333`，容器里的 `127.0.0.1` 指向容器自身。保持 `STORAGE_S3_FORCE_PATH_STYLE=true`。容器内的应用给宿主机浏览器签发直传链接时，还要设置 `STORAGE_S3_PUBLIC_ENDPOINT=http://127.0.0.1:8333`；省略该变量时使用服务端 endpoint，签名后不能替换 host。

直传前由管理员为 bucket 配置前端的准确 CORS 来源、PUT 方法与所需请求头，见 [Uploader 的 CORS 示例](modules/storage.md#bucket-cors)。链接默认 300 秒有效，绑定文件类型、确切长度和防覆盖条件；需要业务自行完成认证、配额、可信上传记录及完成后的核验，不提供公开上传 Controller。

仅 S3 端口映射到宿主机回环地址，其他管理端口不映射。对象与元数据由 SeaweedFS 服务持久化到独立的 `seaweedfs-data` 命名卷；Nest 应用仍直接通过 S3 读写，不创建本地上传或临时目录。此 Compose 配置不能用于生产；生产改用独立配置的 S3 兼容服务、私有 bucket 与专用凭据。

## 应用调试

```bash
pnpm start:debug
```

随后用 IDE 附加 Node.js 调试器。`start:debug` 已通过 `cross-env` 设置 `NODE_ENV=development`，并启用 inspector、代码与资源监听，无需额外指定环境。

构建配置和资源复制见[架构说明](development/architecture.md)；测试断点与分层命令见[测试规范](development/testing.md)。

## 接下来做什么

- 编写业务：[模块开发](development/module-development.md)、[接口规范](development/rest-api.md)。
- 验证变更：[开发流程](development/workflows.md)、[测试规范](development/testing.md)。
- 配置仓库与提交：[Git 约定](development/git-commit.md)；`setup-github.sh` 会修改远端设置，确认目标和权限后再执行。
- 构建与上线：[部署说明](deployment.md)。
