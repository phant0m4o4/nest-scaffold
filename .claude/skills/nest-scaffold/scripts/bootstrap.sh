#!/usr/bin/env bash
# bootstrap.sh
#
# 基于本仓库（nest-scaffold）从零创建一个新项目，复制全部基础设施 + 配置。
#
# 用法：
#   bash .claude/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>
#
# 示例：
#   bash .claude/skills/nest-scaffold/scripts/bootstrap.sh ~/code/my-new-api my-new-api
#
# 流程：
#   1. 复制源码与配置，排除依赖、产物、本地凭据和系统缓存；仅保留环境模板
#   2. 替换 package.json name 为 <APP_NAME>
#   3. 拷贝 .env.example 为 .env 并替换 APP_NAME
#   4. 重新 git init（不带原 commit）
#   5. 输出后续手动步骤

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "用法: bash $0 <target-dir> <APP_NAME>" >&2
  exit 2
fi

TARGET_DIR="$1"
APP_NAME="$2"

if [[ ! "$APP_NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "错误: APP_NAME 必须是小写 kebab-case，如 my-new-api" >&2
  exit 2
fi

if [[ -e "$TARGET_DIR" ]]; then
  echo "错误: 目标路径已存在: $TARGET_DIR" >&2
  exit 1
fi

# 找脚手架根
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
if [[ ! -f "$SCAFFOLD_ROOT/package.json" || ! -d "$SCAFFOLD_ROOT/src/app" ]]; then
  echo "错误: 未在脚手架根目录找到 package.json + src/app（脚本应位于 .claude/skills/nest-scaffold/scripts/）" >&2
  exit 1
fi

echo "==> 脚手架根: $SCAFFOLD_ROOT"
echo "==> 目标目录: $TARGET_DIR"
echo "==> APP_NAME: $APP_NAME"

mkdir -p "$TARGET_DIR"

# 两种复制方式共用排除规则，避免把本地配置、凭据和缓存带入新项目。
COPY_EXCLUDES=(
  'node_modules' '.pnpm-store' 'dist' 'build' 'coverage' '.nyc_output'
  '.tmp' '.temp' 'logs' '.git' '.env' '.env.*' '.ssh'
  '.claude/settings.local.json' '.claude/scheduled_tasks.lock' '.claude/worktrees'
  '.DS_Store' '.DS_STORE' '._*' '.AppleDouble' '.LSOverride'
  'Thumbs.db' 'Desktop.ini' '*.tsbuildinfo' '*.swp' '*.swo' '*~'
)
COPY_OPTIONS=()
for excluded in "${COPY_EXCLUDES[@]}"; do
  COPY_OPTIONS+=("--exclude=$excluded")
done

# rsync 优先；无 rsync 时用 tar 直接排除，无需先复制敏感文件再删除。
if command -v rsync >/dev/null 2>&1; then
  rsync -a "${COPY_OPTIONS[@]}" "$SCAFFOLD_ROOT/" "$TARGET_DIR/"
else
  echo "提示: 未检测到 rsync，使用 tar 复制" >&2
  tar "${COPY_OPTIONS[@]}" -cf - -C "$SCAFFOLD_ROOT" . |
    tar -xf - -C "$TARGET_DIR"
fi

# 替换 package.json name
PKG="$TARGET_DIR/package.json"
if [[ -f "$PKG" ]]; then
  python3 - "$PKG" "$APP_NAME" <<'PY'
import json, sys
path, name = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
data['name'] = name
data['version'] = '0.0.1'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
PY
  echo "✓ 更新 package.json name=$APP_NAME"
fi

# 处理 .env：从 .env.example 复制并替换 APP_NAME
if [[ -f "$SCAFFOLD_ROOT/.env.example" ]]; then
  cp "$SCAFFOLD_ROOT/.env.example" "$TARGET_DIR/.env.example"
  cp "$TARGET_DIR/.env.example" "$TARGET_DIR/.env"
  # macOS / GNU sed 兼容
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^APP_NAME=.*/APP_NAME=$APP_NAME/" "$TARGET_DIR/.env"
    sed -i '' "s/^APP_NAME=.*/APP_NAME=$APP_NAME/" "$TARGET_DIR/.env.example"
  else
    sed -i "s/^APP_NAME=.*/APP_NAME=$APP_NAME/" "$TARGET_DIR/.env"
    sed -i "s/^APP_NAME=.*/APP_NAME=$APP_NAME/" "$TARGET_DIR/.env.example"
  fi
  echo "✓ 生成 .env 并设置 APP_NAME=$APP_NAME"
fi

# 重新 git init
(
  cd "$TARGET_DIR"
  git init -q -b main
  git add .
  git -c user.email=bot@example.com -c user.name=bootstrap commit -qm "chore: bootstrap from nest-scaffold" || true
  echo "✓ git init + 初始 commit 完成"
)

cat <<EOF

✅ 项目已创建: $TARGET_DIR

后续步骤：

1. 进入项目并安装依赖：
   cd "$TARGET_DIR"
   pnpm install

2. 启动基础设施（MySQL / Redis / phpMyAdmin / phpRedisAdmin）：
   docker compose -p $APP_NAME up -d

3. 检查并修改 .env（已基于 .env.example 生成，APP_NAME 已替换）

4. 应用迁移（含基础数据）+ 填充演示数据：
   pnpm db:migrate:mysql
   NODE_ENV=development pnpm db:seed:mysql

5. 启动开发服务：
   pnpm start:dev

6. 访问：
   - API:     http://localhost:3000
   - Bull Board (dev): http://localhost:3000/queues
   - phpMyAdmin:    http://localhost:8081
   - pgAdmin:       http://localhost:8082
   - phpRedisAdmin: http://localhost:8080
EOF
