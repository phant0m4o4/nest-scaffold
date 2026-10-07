# 管理后台与手机前端

仓库使用 pnpm workspace，管理后台位于 `apps/admin-frontend`，手机端位于 `apps/mobile-app`。各应用独立维护依赖、构建配置和环境变量，共用根锁文件。根 `package.json` 负责调度，不把三端运行依赖堆在一起。

## 管理后台

React + TypeScript + Vite 提供 Web 应用基础；TanStack Router 管路由，Query 管 API 请求与缓存，Table 管表格行为，Form 配合 Zod 处理表单校验。Zustand 保存本地界面状态。样式使用 Tailwind CSS，已有 shadcn/ui 的 `components.json` 配置，以及按本地组件方式维护的 Button / Input；当前没有预装完整组件库。

API 数据使用 Query 作为主要缓存来源，不再复制一份到 Zustand。表单输入留在 Form；已提交的名称、类型、页码与每页条数进入 Router 的 URL 查询参数，刷新或分享页面时可恢复。Zustand 只保存主题与侧栏偏好，并通过浏览器 localStorage 持久化。服务端仍须独立校验所有请求，前端校验和隐藏按钮不能代替权限控制。

```bash
pnpm dev:admin
pnpm build:admin
```

当前首页跳转到 `/demos`，提供名称 / 类型筛选、服务端排序分页、刷新、加载 / 空数据 / 错误提示，以及深浅主题和侧栏切换。新增页为 `/demos/new`，详情和编辑页分别为 `/demos/:demoId`、`/demos/:demoId/edit`；这些页面支持直接链接，并在返回列表时保留筛选和排序参数。

表单包含名称、类型和可选父级 ID；名称去除首尾空白后要求 1–100 个字符，父级须是存在的正整数 ID，留空可清除关联，不能指向自身。提交时禁用重复操作，展示字段校验、名称重复和关联冲突；写入成功后刷新 Query 缓存。删除前明确确认，删除当前页末条后纠正页码；仍被子记录引用的父记录不能删除，应先调整子记录关联。示例不提供批量删除或复杂树结构编辑。

没有管理员登录、用户 / 角色管理、权限或会话管理。客户端调用的 `/admin/demo/by-page` 是服务端示例接口，`/admin` 路径本身不提供安全保障，也不是管理后台页面的部署前缀；需要这些能力时同时实现 API 认证授权与前端流程。

## 手机前端

Expo + React Native + TypeScript，使用 `src/app/` 下的 Expo Router 管路由、TanStack Query 管远程数据、Zustand 管本地状态。移动端使用原生组件，不直接共享管理后台的 DOM、CSS 或 shadcn/ui 组件。

当前包含“发现”和“偏好”两个 Tab：“发现”提供公开 Demo 列表、名称 / 类型筛选、分页、下拉刷新及加载 / 空数据 / 错误提示；点击记录进入 `/demos/:publicId` 详情，展示名称、类型、公开编号和创建 / 更新时间，支持错误重试及记录不存在提示。根 Stack 承载详情，Tab 路由组保留发现页状态；直接打开详情时也能返回发现。手机端只读，不展示管理端编辑入口。

“偏好”切换紧凑列表，重启应用后重置。Query 已接入 NetInfo 与 AppState，处理联网恢复和切回前台时的刷新；没有离线数据持久化、用户注册登录或个人中心。

```bash
# 以下命令在仓库根目录执行，选择一个启动方式
pnpm dev:mobile
pnpm --filter @nest-scaffold/mobile-app android
pnpm --filter @nest-scaffold/mobile-app ios
pnpm --filter @nest-scaffold/mobile-app web

# 导出三平台 bundle 与资源
pnpm build:mobile
```

首次运行按平台准备环境：

| 运行方式       | 前置条件与启动方式                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Web 预览       | 运行上面的 `web` 命令，打开终端显示的地址；不需要原生 SDK                                                                    |
| Android 模拟器 | 安装 Android Studio、Android SDK 与 Emulator，创建并启动虚拟设备，确认终端可运行 `adb`；再执行 `android` 命令                |
| iOS 模拟器     | 本地运行需要 macOS、Xcode、Command Line Tools 和已安装的 iOS 模拟器运行时；再执行 `ios` 命令                                 |
| 真机           | 为设备安装与项目 Expo SDK 兼容的 Expo Go，运行 `pnpm dev:mobile` 后扫描二维码；设备必须能访问开发服务器及单独配置的 API 地址 |

平台 SDK 和工具的安装细节见 Expo 官方的 [Android 模拟器](https://docs.expo.dev/workflow/android-studio-emulator/)、[iOS 模拟器](https://docs.expo.dev/workflow/ios-simulator/)与[开发环境准备](https://docs.expo.dev/get-started/set-up-your-environment/)。`android` / `ios` 脚本只启动 Expo 开发服务并打开对应平台，不执行本地原生编译。

`build:mobile` 执行 `expo export --platform all`，在 `apps/mobile-app/dist/` 生成 JavaScript bundle 与静态资源，**不是已签名的 Android / iOS 安装包**。原生签名、商店提交和更新发布是独立流程；当前没有 `expo-dev-client`、`eas.json`、应用商店包标识或自动发布配置。需要开发构建或商店发布时按业务配置 `app.config.ts` 及对应平台，见[部署说明](../deployment.md#5-expo-移动应用发布)。

Expo、React Native 与 React 的版本以手机应用的兼容组合为准；不要为与管理后台统一 React 版本而强行覆盖依赖。Expo Go 仅用于支持范围内的快速联调，生产应用开发及新增自定义原生模块时按官方说明配置开发构建，不能假定所有模块都能运行于 Expo Go。

## 共享代码边界

- `packages/contracts`：纯 TypeScript / Zod 的公开请求和响应契约，不依赖 Nest、数据库或服务端配置。
- `packages/api-client`：基于 fetch 的请求、响应校验和错误处理，供管理后台调用 Demo CRUD、手机端调用公开列表和详情。
- API 的 DTO、数据库 Schema 和服务端密钥不因“共享”而进入客户端。公开用户端的 `PublicDemo` 使用 `publicId` / `shortPublicId`，不含内部数字主键；管理侧 `AdminDemo` 契约按现有接口另外包含 `id` / `parentId`，不应把管理侧响应直接用于用户页面。
- 各端自行装配 Query、路由与状态，不为了复用建立混合 Web / Native 的组件框架。共享包只加入已经存在的共同需求。

共享包当前导出 TypeScript 源码，由 Vite / Metro 编译；共享包的 `build` 只执行类型检查，无需先生成 `dist` 或启动独立 watch。

共享客户端提供以下方法，均支持通过 `RequestOptions.signal` 取消请求：

| 方法                                 | HTTP 路径与结果                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `listAdminDemos` / `listPublicDemos` | GET `/admin/demo/by-page` / `/demo/by-page`，返回列表与分页信息              |
| `getAdminDemo` / `getPublicDemo`     | GET `/admin/demo/:id` / `/demo/:publicId`，返回详情，查无记录时 `data: null` |
| `createAdminDemo`                    | POST `/admin/demo`，返回 201 与新记录 `id`                                   |
| `updateAdminDemo`                    | PATCH `/admin/demo/:id`，只提交待修改字段，返回 200                          |
| `deleteAdminDemo`                    | DELETE `/admin/demo/:id`，返回 200                                           |

列表支持 `page`、`pageSize`、`name`、`type`、`orderColumn` 和 `orderDirection`；客户端排序列限定为 `id`、`name`、`type`、`createdAt`、`updatedAt`。写入前按共享 Zod schema 校验请求，成功响应也按契约校验。HTTP 错误或无效响应转为 `ApiError`，保留 `status`、`code`、`message` 和可选字段明细 `errors[]`；网络错误仍由 fetch 抛出。客户端默认 `credentials: 'omit'`，没有自动附加 Token、刷新会话或登录跳转；将来接入认证须同时确定两端的凭据传递与服务端校验方式。

服务端仍维护自己的 DTO / Entity，共享契约尚未替代服务端运行时校验；现有 `demo-contract.unit-spec.ts` 检查 Entity 序列化与共享契约的一致性。新增共同接口时同步更新公开 schema、客户端方法、服务端响应及必要测试，再在两个前端接入，不能只改 TypeScript 类型。

Demo 仅在 API 的开发 / 测试环境注册。前端构建成功不代表生产 API 已开放 Demo，也不代表认证、权限和业务功能已经完成。

## 环境变量与联调

首次配置分别复制 [API 模板](../../apps/server/.env.example)、[管理后台模板](../../apps/admin-frontend/.env.example)和[手机端模板](../../apps/mobile-app/.env.example)，保存到各自应用的 `.env`。根目录旧 `.env` 由使用者手动迁到 `apps/server/.env`，不能复用为前端配置。

手机端通过 `EXPO_PUBLIC_API_BASE_URL` 设置 API 地址。Vite 的 `VITE_*` 和 Expo 的 `EXPO_PUBLIC_*` 会进入客户端产物，应当视作公开信息。只放 API 地址等可公开配置；数据库密码、S3 长期凭据、`APP_MASTER_KEY`、签名私钥和生产 Secrets 只能由服务端或独立发布环境持有。Vite 环境变量修改后重启开发服务；Expo 的公开变量修改后完整重新加载应用，已导出的产物需要重新构建。Expo 变量用 `process.env.EXPO_PUBLIC_变量名` 静态读取，不用解构或动态键访问，也不用 `NODE_ENV` 选择业务环境，见 [Expo 环境变量说明](https://docs.expo.dev/guides/environment-variables/)。

- 管理后台开发地址为 `http://127.0.0.1:5173`，默认 `VITE_API_BASE_URL=/api`。Vite 将 `/api` 请求去掉该前缀后转发到 `API_PROXY_TARGET=http://127.0.0.1:3000`；后端更换端口时同步调整代理目标。`API_PROXY_TARGET` 只供开发服务器使用，不进入浏览器产物。
- 如果改为浏览器直接访问独立 API 地址，设置 `VITE_API_BASE_URL` 为该地址，同时让 API 的 `APP_CORS_DOMAINS` 包含实际浏览器来源，不能带页面路径。默认同源代理无需为此额外放开 CORS。
- iOS 模拟器通常可访问开发机回环地址；Android 模拟器访问宿主机通常使用 `http://10.0.2.2:3000`。
- 真机使用开发机在同一可信网络中的 IP。API 默认只监听 `127.0.0.1`，需要时在 API 本地配置显式设置 `APP_ADDRESS=0.0.0.0`，并限制防火墙来源。Expo 的开发服务隧道不会自动代理独立的 Nest API。
- 原生网络请求与浏览器 CORS 的处理不同；Expo Web 仍受浏览器 CORS 限制。生产 API 使用 HTTPS，不靠放宽安全默认值解决联调问题。

开发环境直连 API 的基地址不加 `/api`：例如手机端使用 `http://10.0.2.2:3000`，由客户端拼接 `/demo/by-page`。管理后台的 `/api` 是 Vite / Nginx 代理前缀，服务端没有设置全局 `/api` 前缀；部署后是否包含该前缀取决于实际代理入口。

列表联调失败时先确认 API 正在开发模式运行且本地迁移已应用，再检查 API 地址与端口：连接拒绝通常检查进程和监听地址；浏览器跨域错误检查来源白名单；Demo 返回 404 时检查是否错误连接了生产 API。请求成功但列表为空并不表示故障，填充演示数据的方法见[快速开始](../getting-started.md#首次启动)。

## 移动端本地数据与业务文件

服务端的“除日志外禁止本地写入”约束针对 API、Worker 等服务端运行时。手机本地偏好可按移动端规范持久化；未来实现登录后，敏感会话凭据应使用平台安全存储，不写入普通偏好存储、日志或打包环境变量。当前脚手架没有认证凭据持久化实现。

上传业务文件仍通过 API 授权与 S3 兼容 Storage 的短时链接完成，不把长期 S3 凭据交给手机。相册选择、平台缓存及下载等本地文件能力需按具体业务明确权限、保留期限和清理行为；不能由移动端需求反向开放服务端临时落盘。

## 验证与发布

根 `pnpm typecheck`、`pnpm lint:check` 与 `pnpm build` 检查工作区；共享契约与客户端单测纳入 `pnpm test:unit`。API 的生产镜像 E2E 不等于浏览器或手机 UI E2E，导出 bundle 也不等于真机验证；按本次功能增加必要的界面与平台验证，见[测试规范](testing.md)。

API 和管理后台使用各自 Dockerfile，以仓库根为构建上下文。Expo 原生应用独立构建和发布，遵循[部署说明](../deployment.md)中的边界；普通开发、构建和测试不授权推送镜像、上传应用或发布更新。
