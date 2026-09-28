# 生产镜像：多阶段构建（构建产物 + 仅生产依赖）
# 版本与 package.json engines / packageManager 对应
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# 构建阶段：全量依赖 + SWC 构建
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 生产依赖阶段：只装 dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 运行阶段
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Nest 本地开发默认只监听 loopback；容器中必须监听全部接口才能通过端口映射访问
ENV APP_ADDRESS=0.0.0.0
# 容器日志默认写 stdout；文件日志应通过显式可写 volume 开启
ENV LOG_FILE_ENABLE=false
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# 迁移文件与 drizzle 配置一并打包，容器内可直接执行数据库迁移
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle-mysql.config.ts /app/drizzle-pgsql.config.ts ./
COPY package.json ./
# 在构建期验证最终镜像中的生产依赖足以加载完整 Nest 模块图
RUN node -e "require('./dist/app/app.module')"
# 非 root 运行
USER node
EXPOSE 3000
# 数据库迁移按需在部署流程中执行（drizzle-kit 在生产依赖中，含表结构与基础数据）：
#   node node_modules/drizzle-kit/bin.cjs migrate --config drizzle-mysql.config.ts
CMD ["node", "dist/main"]
