#!/usr/bin/env bash
# bootstrap.sh
#
# 基于本仓库（nest-scaffold）从零创建一个新项目，复制全部基础设施 + 配置。
#
# 用法：
#   bash .cursor/skills/nest-scaffold/scripts/bootstrap.sh <target-dir> <APP_NAME>
#
# 示例：
#   bash .cursor/skills/nest-scaffold/scripts/bootstrap.sh ~/code/my-new-api my-new-api
#
# 流程：
#   1. 把本仓库（除 node_modules / dist / coverage / .tmp / logs / .git）拷贝到 <target-dir>
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
  echo "错误: 未在脚手架根目录找到 package.json + src/app（脚本应位于 .cursor/skills/nest-scaffold/scripts/）" >&2
  exit 1
fi

echo "==> 脚手架根: $SCAFFOLD_ROOT"
echo "==> 目标目录: $TARGET_DIR"
echo "==> APP_NAME: $APP_NAME"

mkdir -p "$TARGET_DIR"

# 拷贝（rsync 优先，没有就用 cp + 后续清理）
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='coverage' \
    --exclude='.tmp' \
    --exclude='logs' \
    --exclude='.git' \
    --exclude='.env' \
    "$SCAFFOLD_ROOT/" "$TARGET_DIR/"
else
  echo "警告: 未检测到 rsync，回退到 cp（速度较慢）" >&2
  cp -R "$SCAFFOLD_ROOT/." "$TARGET_DIR/"
  rm -rf "$TARGET_DIR/node_modules" "$TARGET_DIR/dist" "$TARGET_DIR/coverage" \
         "$TARGET_DIR/.tmp" "$TARGET_DIR/logs" "$TARGET_DIR/.git" "$TARGET_DIR/.env"
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
if [[ -f "$TARGET_DIR/.env.example" ]]; then
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

4. 同步表结构 + 初始化数据：
   pnpm db:push
   pnpm db:init:dev
   pnpm db:seed:dev

5. 启动开发服务：
   pnpm start:dev

6. 访问：
   - API:     http://localhost:3000
   - Swagger: http://localhost:3000/api-docs
   - Bull Board (dev): http://localhost:3000/queues
   - phpMyAdmin:    http://localhost:8080
   - phpRedisAdmin: http://localhost:8081
EOF
