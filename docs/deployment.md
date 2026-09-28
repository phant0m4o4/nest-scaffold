# Docker 部署与 GitHub CI/CD

生产只采用 Docker 部署。默认方案是 **GitHub Actions + GHCR 镜像仓库 + 单台服务器上的 Docker Compose**；数据库与 Redis 独立维护，不引入 Kubernetes 等额外平台。服务器不安装项目的 Node.js / pnpm，不在服务器构建源码。

仓库已有 [Dockerfile](../Dockerfile) 和 [CI](../.github/workflows/ci.yml)，**CD 尚未启用**。下面提供生产 Compose、服务器发布脚本和 `.github/workflows/cd.yml` 模板；完成服务器与 GitHub 配置后再启用，不会仅因推送代码而自动上线。

## 1. 发布流程与前提

```text
PR / main push → CI：lint、构建、单测、集成测试、生产镜像 E2E
main push 的 CI 全部成功 → CD：固定提交构建 → 镜像 E2E → 推送 GHCR
→ production 环境审批（若配置）→ SSH → 拉取 digest → 迁移 → 更新容器 → 启动检查
```

- [现有 CI](../.github/workflows/ci.yml) 的 `ci` / `docker` 都应设为分支保护必需检查，见 [Git 约定](development/git-commit.md)。CI 不推送镜像、不访问生产服务器；测试分层见[测试规范](development/testing.md)。
- CD 只接受本仓库 `main` 的成功 push CI，检出该次 CI 的 `head_sha`；不发布 PR、fork 或其他分支。为保持现有 CI 独立，CD 会重新构建并对待推送的同一份镜像执行 E2E。
- 镜像以唯一标签保存，部署使用不可变的 `sha256` digest，不使用 `latest`。旧镜像需保留到回退窗口结束，参见 [GHCR 按 digest 拉取](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#pull-by-digest)。
- 本示例为 Linux **amd64** 单实例，更新时允许短暂停机。ARM 服务器需要调整构建平台，并验证该平台镜像；不能直接套用。
- 上线前核对生产数据库、Redis、备份、迁移 SQL、CORS 和可信反向代理。只执行随版本提交的 migration，不运行 seed、reset 或 `drizzle-kit push`。
- 数据保护按[备份与恢复](backup-and-restore.md)配置定时 / 按需备份、失败告警与隔离恢复演练，机外副本可选择 [S3 或其他存储后端](backup-and-restore.md#备份存储后端)。破坏性迁移或数据库升级前核对新的备份编号；下面的 CD 模板不会自动备份，也没有自动备份门禁。
- 迁移期间旧应用仍在运行，必须兼容旧代码；删列等破坏性修改分阶段执行或安排维护窗口。数据库回退不包含在应用回退中。

## 2. 一次性准备服务器

准备一台能访问 GHCR、生产数据库和 Redis 的 Linux amd64 服务器，安装 Docker Engine、仍受维护的 Docker Compose 插件、Bash 与 `flock`。Compose 至少 **2.30.0**，以支持下面的 [`env_file.format: raw`](https://docs.docker.com/reference/compose-file/services/#env_file)。

使用专用部署账号，准备其可写的 `/srv/nest-app` 目录。该账号需要使用 Docker；Docker daemon 的访问权限通常等同高权限，必须保护 SSH 私钥、限制登录来源，并且不要与不可信用户共用账号。

### 生产变量

在服务器上独立维护 `/srv/nest-app/.env.production`，权限设为 `0600`，不提交、不放进镜像、不通过 CI 上传覆盖。依据[环境变量说明](development/env-vars.md)和[模板](../.env.example)填写：

- 实际生产 `MYSQL_*`、独立 `APP_MASTER_KEY`、CORS 白名单，以及实际需要的其他配置。
- 各模块的 `CACHE_REDIS_*`、`DISTRIBUTED_LOCK_REDIS_*`、`QUEUE_REDIS_*` 分别填写，Redis 仅用单机或哨兵。容器内 `127.0.0.1` 不是宿主机或外部数据库；使用容器可达的内网地址或已配置网络的服务名。
- `raw` 不做插值；所有变量写最终值，不照搬 `${REDIS_HOST}` 等引用，也不要在值外加引号，因为引号会成为值的一部分。
- `NODE_ENV`、监听地址、端口和日志方式由下方 Compose 明确覆盖，不必写进变量文件。不要为绕过校验随意打开 `APP_CORS_MANAGED_BY_PROXY`。

数据库与 Redis 不由下面的 Compose 管理，不能把包含示例密码和管理界面的[开发 Compose](../docker-compose.yml)直接用于生产。Redis 实例隔离与淘汰策略见[基础设施说明](development/infra-modules.md)。

### 生产 Compose

保存为服务器上的 `/srv/nest-app/compose.yaml`：

```yaml
services:
  app:
    image: ${APP_IMAGE:?set APP_IMAGE to the release digest}
    env_file:
      - path: ./.env.production
        format: raw
    environment:
      NODE_ENV: production
      APP_ADDRESS: 0.0.0.0
      APP_PORT: '3000'
      LOG_FILE_ENABLE: 'false'
    ports:
      - '127.0.0.1:3000:3000'
    restart: unless-stopped
    stop_grace_period: 15s
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          const s=require('node:net').connect(3000,'127.0.0.1');
          s.setTimeout(2000);
          s.once('connect',()=>process.exit(0));
          s.once('error',()=>process.exit(1));
          s.once('timeout',()=>process.exit(1));
      interval: 10s
      timeout: 3s
      start_period: 20s
      retries: 6
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

[Dockerfile](../Dockerfile) 已配置 Node 24、多阶段构建、生产依赖和非 root 用户，包含迁移资源与 `drizzle-kit`，不包含 `.env`。应用平滑停机上限为 10 秒，因此容器等待 15 秒再强制结束。

应用与 Worker 遵守[文件写入与 Storage](development/engineering-conventions.md#文件写入与-storage)：除日志外不写本地文件，不挂载上传、导出、缓存或备份目录，不用 `/tmp` / `tmpfs` 暂存；业务文件直接经 S3 兼容 Storage 处理。本例关闭应用文件日志，由 Docker 收集 stdout / stderr。非 root 不等于只读文件系统，当前模板尚未启用只读根文件系统，也不能宣称已从容器层强制该约束；部署加固时须验证启动、依赖及日志行为，不能为解决兼容问题开放业务落盘目录。

这里由**宿主机上的反向代理**转发到 `127.0.0.1:3000` 并提供 HTTPS，应用端口不直接暴露公网。若代理也在容器内，需另行配置共享网络，不能把代理容器的 localhost 当成宿主机。

项目目前没有 `/health`，生产环境也不暴露 Demo 路由。上述探针只检查 TCP 监听，**不代表数据库、队列或业务可用**；`unhealthy` 本身也不会触发 Docker 的进程重启策略。业务项目应补充无业务写入副作用的就绪检查和只读接口冒烟验证。

### 服务器发布脚本

保存为 `/srv/nest-app/deploy.sh`，将 `ghcr.io/owner/repository` 替换为本项目的实际镜像名（全小写）。脚本只接受这个仓库的 digest；生产变量不会随发布修改。

这里的部署锁和镜像状态文件由独立运维工具在宿主机管理，不是应用运行时文件写入；应用容器不得挂载该发布目录。

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /srv/nest-app

image_repo=ghcr.io/owner/repository
image="${1:?usage: deploy.sh IMAGE_DIGEST [deploy|rollback]}"
mode="${2:-deploy}"
[[ "$image" == "$image_repo"@sha256:* ]] || exit 1
[[ "${image#"$image_repo"@sha256:}" =~ ^[0-9a-f]{64}$ ]] || exit 1
[[ "$mode" == deploy || "$mode" == rollback ]] || exit 1

# CI/CD 与人工操作共用锁，避免并发迁移或切换容器。
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
export APP_IMAGE="$image"
compose() {
  docker compose --env-file /dev/null -p nest-app \
    -f /srv/nest-app/compose.yaml "$@"
}

compose pull app
if [[ "$mode" == deploy ]]; then
  compose run --rm --no-deps -T app \
    node node_modules/drizzle-kit/bin.cjs migrate --config drizzle-mysql.config.ts
fi
compose up -d --no-deps --wait --wait-timeout 120 app

# 记录通过启动检查的镜像；不能代替业务验收。
if [[ -s current-image ]] && [[ "$(<current-image)" != "$image" ]]; then
  cp current-image previous-image
fi
printf '%s\n' "$image" > .current-image.next
mv .current-image.next current-image
```

当前应用模块与示例仓储使用 MySQL。使用 PostgreSQL 时，先按[数据库文档](development/database.md)切换应用模块和仓储、完成测试，再调整迁移配置为 `drizzle-pgsql.config.ts`；只修改配置文件名与环境变量不够。

`pull` 或迁移失败会终止发布，尚未替换旧应用；但迁移可能已部分修改数据库。[`up --wait`](https://docs.docker.com/reference/cli/docker/compose/up/) 会替换应用并等待启动检查通过，失败不会自动恢复旧容器。失败时先检查日志、数据库状态，再决定修复或回退。

### 私有镜像拉取权限

私有 GHCR 镜像需要在服务器上，以**同一部署账号**预先执行 `docker login ghcr.io`。使用有该包读取权限的专用账号和仅需 `read:packages` 的 classic PAT，通过交互或 `--password-stdin` 输入，避免写入命令参数、文档或 shell 历史；公开镜像可匿名拉取。组织启用 SSO 时还需授权，参见 [GHCR 身份验证](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry)。

不要把 Actions 的临时 `GITHUB_TOKEN` 当成服务器长期凭据；保护 Docker 凭据文件，条件允许时使用 credential helper。

## 3. GitHub 配置与 CD 工作流

先在 GitHub 创建 `production` Environment，并配置以下 **Environment Secrets**：

| Secret            | 内容                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `SSH_HOST`        | 服务器地址                                                          |
| `SSH_PORT`        | SSH 端口，如 `22`                                                   |
| `SSH_USER`        | 专用部署账号                                                        |
| `SSH_KEY`         | 对应的部署私钥                                                      |
| `SSH_KNOWN_HOSTS` | 经可信渠道核验的完整 known_hosts 记录；非默认端口使用 `[host]:port` |

不要关闭 SSH 主机校验，也不要直接把未经核验的 `ssh-keyscan` 结果当作可信记录。需要人工审批时配置 required reviewers；仅写 `environment: production` **不会自动启用审批**。Environment 功能和审批规则的可用性取决于仓库可见性及套餐，启用前核对 [GitHub 环境配置](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。

下方模板保存为 `.github/workflows/cd.yml` 并合入默认分支后才会生效。`workflow_run` 能获得写权限，因此必须保留来源和事件校验，不消费 PR 提供的构建产物或缓存；详见 [GitHub 触发器说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。

```yaml
name: CD
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
permissions:
  contents: read
concurrency:
  group: production-cd
  cancel-in-progress: false
jobs:
  publish:
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.head_repository.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      packages: write
    outputs:
      image_ref: ${{ steps.push.outputs.image_ref }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
          persist-credentials: false
      - name: 跳过已被 main 新提交取代的版本
        env:
          GH_TOKEN: ${{ github.token }}
          REPOSITORY: ${{ github.repository }}
          RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}
        run: test "$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)" = "$RELEASE_SHA"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          package-manager-cache: false
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1
      - uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: .
          platforms: linux/amd64
          load: true
          push: false
          tags: nest-scaffold:release
          labels: org.opencontainers.image.source=https://github.com/${{ github.repository }}
      - name: 验证即将推送的同一份镜像
        env:
          E2E_APP_IMAGE: nest-scaffold:release
        run: pnpm test:e2e
      - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: 推送并记录 digest
        id: push
        env:
          REPOSITORY: ${{ github.repository }}
          RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}
        shell: bash
        run: |
          set -euo pipefail
          image_repo="ghcr.io/${REPOSITORY,,}"
          image_tag="$image_repo:sha-$RELEASE_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
          docker tag nest-scaffold:release "$image_tag"
          docker push "$image_tag"
          digest=$(docker buildx imagetools inspect "$image_tag" --format '{{.Manifest.Digest}}')
          [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
          image_ref="$image_repo@$digest"
          echo "image_ref=$image_ref" >> "$GITHUB_OUTPUT"

  deploy:
    needs: publish
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    steps:
      - name: 审批后再次核对 main，避免旧版本覆盖新版本
        env:
          GH_TOKEN: ${{ github.token }}
          REPOSITORY: ${{ github.repository }}
          RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}
        run: test "$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)" = "$RELEASE_SHA"
      - name: SSH 部署固定镜像
        env:
          IMAGE_REF: ${{ needs.publish.outputs.image_ref }}
          REPOSITORY: ${{ github.repository }}
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_PORT: ${{ secrets.SSH_PORT }}
          SSH_USER: ${{ secrets.SSH_USER }}
          SSH_KEY: ${{ secrets.SSH_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.SSH_KNOWN_HOSTS }}
        shell: bash
        run: |
          set -euo pipefail
          image_repo="ghcr.io/${REPOSITORY,,}"
          [[ "$IMAGE_REF" == "$image_repo"@sha256:* ]]
          [[ "${IMAGE_REF#"$image_repo"@sha256:}" =~ ^[0-9a-f]{64}$ ]]
          [[ "$SSH_PORT" =~ ^[0-9]+$ ]]
          umask 077
          ssh_dir=$(mktemp -d)
          trap 'rm -f "$ssh_dir/key" "$ssh_dir/known_hosts"; rmdir "$ssh_dir"' EXIT
          printf '%s\n' "$SSH_KEY" > "$ssh_dir/key"
          printf '%s\n' "$SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
          ssh -i "$ssh_dir/key" -p "$SSH_PORT" -l "$SSH_USER" \
            -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 \
            -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$ssh_dir/known_hosts" \
            "$SSH_HOST" "bash /srv/nest-app/deploy.sh '$IMAGE_REF'"
```

Actions 固定到核验过的完整提交 SHA，注释标明版本；维护时一起更新。镜像发布仅使用 `GITHUB_TOKEN` 的 `packages: write`，仍需允许该仓库写入对应 GHCR 包。生产 SSH Secrets 只放在 `deploy` 所用的 Environment，不授予镜像构建步骤。

推送后用 [`imagetools inspect`](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/#format-the-output-format) 从唯一标签读取远端 digest，避免依赖本地镜像的多个仓库引用顺序。

并发组串行发布，且不因新提交取消正在执行的迁移；服务器锁同时约束手动发布。过期提交检查不通过时该次 CD 会失败退出，这是有意阻止旧版本上线，等待最新提交的 CI/CD 即可。不要手动取消正在迁移的任务；若任务超时或 SSH 中断，先在服务器核实实际状态再重试。

这是持续部署：启用后，`main` 最新提交的 CI 成功就进入发布流程；是否等待人工批准取决于 Environment 设置。不要给未经审查的代码开放 `main` 写入权限，也不要把这个高权限 workflow 改为直接处理 PR。

## 4. 检查、回退与日常维护

发布后通过事先确认无业务副作用的只读接口及已有日志、监控检查运行状态。不得为了冒烟验证创建生产订单、发送消息、触发真实任务、调用外部写入接口或提交主网交易；GET 请求也不当然代表无副作用，详见[测试安全边界](development/testing.md#测试安全边界)。

模板只保证所选镜像通过隔离环境中的 E2E、迁移命令成功及容器启动检查通过；没有替业务项目定义验收接口。确定安全的只读冒烟命令后，应把它放在 `deploy.sh` 的 `compose up` 后、写入镜像记录前，让失败中止发布并告警。前面的生产 migration 属于经授权的发布操作，不是测试；不能以运行测试或排查问题为由执行生产迁移。

在服务器上查看状态与日志（首次启动检查失败、还没有 `current-image` 时，使用该次 CD 推送的 digest 设置 `APP_IMAGE`）：

```bash
cd /srv/nest-app
export APP_IMAGE="$(<current-image)"
docker compose --env-file /dev/null -p nest-app -f compose.yaml ps
docker compose --env-file /dev/null -p nest-app -f compose.yaml logs --tail=100 app
```

关闭应用文件日志后，查看命令、Docker 轮转、宿主机磁盘边界及集中采集 / 长期归档方式见[不落盘日志](modules/logger.md#不落盘日志默认方式)。

`current-image` / `previous-image` 记录通过启动检查的当前版本及上一版本。首次部署没有可回退版本；未通过检查的新容器不会更新记录。若失败发生在替换容器后，可使用原 `current-image` 恢复；若新版本已通过检查、随后发现业务问题，则使用 `previous-image`。

人工确认数据库 schema 和环境配置仍兼容旧版后，再运行以下**其中一种**回退：

```bash
cd /srv/nest-app
# 新容器启动失败，恢复记录中最后通过检查的版本。
bash deploy.sh "$(<current-image)" rollback

# 或：新版本已更新记录，之后发现业务问题，回退到上一版。
# bash deploy.sh "$(<previous-image)" rollback
```

回退只拉取并启动旧镜像，**不执行旧迁移、不自动回滚数据库**。如果新 schema 已不兼容旧版，应执行修复发布或经确认的[数据库恢复流程](backup-and-restore.md#恢复与演练)，不能直接套用回退命令。

为 GitHub 发布失败、应用错误和磁盘容量配置通知；按实际回退窗口管理 GHCR 镜像和服务器缓存。常规发布不需要 `compose down`，更不能执行 `down -v` 或清理数据库数据卷。
