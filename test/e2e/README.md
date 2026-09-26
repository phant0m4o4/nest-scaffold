# E2E 测试边界

这里仅放完整应用的黑盒端到端测试（`*.e2e-spec.ts`）：

- 启动与生产一致的完整应用装配，而不是自行组合 Nest 测试模块；
- 不替换应用内部的 Provider、Pipe、Filter、Interceptor 或配置；
- 只从 HTTP 等公开边界发送输入并验证输出；
- MySQL、Redis 等依赖可以由 Testcontainers 提供，但“用了容器”本身不代表 E2E。

`production-image.e2e-spec.ts` 从 `Dockerfile` 构建生产镜像，通过镜像默认启动命令运行完整应用。它不替换内部依赖、不读取本地 `.env`，使用独立网络中的临时 MySQL 9、Redis 8 容器，并验证：

- 非 root 运行、Argon2 原生依赖可用；
- 翻译和迁移资源齐全，本机配置、源码与测试目录未进入运行镜像；
- 数据库迁移连续执行两次，表结构与基础数据正确且不重复；
- HTTP（网页请求协议）统一 404 响应，生产环境不暴露 Demo、管理端 Demo 和队列面板；
- CORS（跨域访问控制）白名单生效，错误的生产配置拒绝启动；
- 真实 SIGTERM（进程终止信号）触发正常停机并以状态码 0 退出。

运行前启动 Docker，并确保 `docker` 命令在 `PATH` 中；首次构建及拉取依赖镜像需要网络：

```bash
pnpm test:e2e
# 或通过全量入口运行
pnpm test
```

默认构建使用随机临时镜像标签，结束后清理测试创建的镜像、容器和网络。已有本地生产镜像时可跳过构建：

```bash
E2E_APP_IMAGE=<本地镜像标签> pnpm test:e2e
```

指定的镜像由调用方管理，测试不会删除它。CI（持续集成检查）在 `docker` 任务中构建并加载 `nest-scaffold:e2e`，通过同一变量复用。

现有 Redis factory 和 Demo cursor 测试仍位于 `src/**`，归类为集成测试。
