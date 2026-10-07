# 从仓库根构建：docker build -f apps/admin-frontend/Dockerfile .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-frontend/package.json ./apps/admin-frontend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN pnpm --filter @nest-scaffold/admin-frontend... install --frozen-lockfile
COPY apps/admin-frontend ./apps/admin-frontend
COPY packages ./packages
# 只接受公开配置，绝不复制服务端环境文件。
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @nest-scaffold/admin-frontend build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runner
COPY apps/admin-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/admin-frontend/dist /usr/share/nginx/html
EXPOSE 8080
