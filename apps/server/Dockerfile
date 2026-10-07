# 从仓库根构建：docker build -f apps/server/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

FROM base AS build
RUN pnpm --filter @nest-scaffold/server... install --frozen-lockfile
COPY apps/server ./apps/server
COPY packages/contracts ./packages/contracts
RUN pnpm --filter @nest-scaffold/server build

FROM base AS prod-deps
RUN pnpm --filter @nest-scaffold/server install --frozen-lockfile --prod

FROM node:24-alpine AS runner
# 保留 pnpm 的相对符号链接布局，只携带 API 生产依赖与构建产物。
COPY --from=prod-deps /workspace/node_modules /app/node_modules
COPY --from=prod-deps /workspace/apps/server/node_modules /app/apps/server/node_modules
WORKDIR /app/apps/server
ENV NODE_ENV=production
ENV APP_ADDRESS=0.0.0.0
ENV LOG_FILE_ENABLE=false
COPY --from=build /workspace/apps/server/dist ./dist
COPY --from=build /workspace/apps/server/drizzle ./drizzle
COPY --from=build /workspace/apps/server/drizzle-mysql.config.ts /workspace/apps/server/drizzle-pgsql.config.ts ./
COPY apps/server/package.json ./
RUN node -e "require('./dist/app/app.module')"
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
