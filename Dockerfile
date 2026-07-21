# 生产镜像：多阶段构建（构建产物 + 仅生产依赖）
# 版本与 package.json engines / packageManager 对应
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# 构建阶段：全量依赖 + SWC 构建
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 生产依赖阶段：只装 dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 运行阶段
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# 迁移文件与 drizzle 配置一并打包，容器内可直接执行数据库迁移
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle-mysql.config.ts /app/drizzle-pgsql.config.ts ./
COPY package.json ./
# 非 root 运行
USER node
EXPOSE 3000
# 数据库迁移/初始化按需在部署流程中执行（drizzle-kit 在生产依赖中）：
#   npx drizzle-kit migrate --config drizzle-mysql.config.ts
#   node dist/common/modules/database/mysql/tools/init.main
CMD ["node", "dist/main"]
