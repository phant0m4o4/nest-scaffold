#!/usr/bin/env bash
# bootstrap.sh
#
# 基于本仓库（nest-scaffold）从零创建一个新项目，复制全部基础设施 + 配置。
#
# 用法：
#   bash scripts/bootstrap.sh <target-dir> <APP_NAME>
#
# 示例：
#   bash scripts/bootstrap.sh ~/code/my-new-api my-new-api
#
# 流程：
#   1. 复制源码与配置，排除依赖、产物、本地凭据和系统缓存；仅保留环境模板
#   2. 替换 package.json name 为 <APP_NAME>
#   3. 从各应用 .env.example 生成独立 .env，并替换服务端 APP_NAME
#   4. 沿用源仓库本地身份，重新 git init（不带原 commit）
#   5. 输出后续手动步骤

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "用法: bash $0 <target-dir> <APP_NAME>" >&2
  exit 2
fi

# Git hook / 外层脚本可能导出仓库路径、命令级配置或跟踪输出；-C 不能隔离这些变量。
# 必须在任何 Git 调用和文件写入前拒绝，只报告变量名，不泄露路径或身份值。
for git_env_name in "${!GIT_@}"; do
  case "$git_env_name" in
    GIT_DIR | GIT_WORK_TREE | GIT_COMMON_DIR | GIT_TEMPLATE_DIR | GIT_INDEX_FILE | \
    GIT_OBJECT_DIRECTORY | GIT_ALTERNATE_OBJECT_DIRECTORIES | GIT_QUARANTINE_PATH | \
    GIT_GRAFT_FILE | GIT_SHALLOW_FILE | GIT_NAMESPACE | GIT_REPLACE_REF_BASE | \
    GIT_CEILING_DIRECTORIES | GIT_DISCOVERY_ACROSS_FILESYSTEM | \
    GIT_CONFIG | GIT_CONFIG_PARAMETERS | GIT_CONFIG_COUNT | GIT_CONFIG_KEY_* | GIT_CONFIG_VALUE_* | \
    GIT_AUTHOR_* | GIT_COMMITTER_* | GIT_TRACE*)
      echo "错误: 检测到 Git 环境覆盖变量 $git_env_name；请在不含该覆盖变量的终端中重试" >&2
      exit 1
      ;;
  esac
done

REQUESTED_TARGET_DIR="$1"
APP_NAME="$2"

if [[ ! "$APP_NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "错误: APP_NAME 必须是小写 kebab-case，如 my-new-api" >&2
  exit 2
fi

# 找脚手架根
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ ! -f "$SCAFFOLD_ROOT/package.json" || ! -d "$SCAFFOLD_ROOT/apps/server/src/app" ]]; then
  echo "错误: 未在脚手架根目录找到 package.json + apps/server/src/app（脚本应位于 scripts/）" >&2
  exit 1
fi

# 创建目标前解析真实路径；源目录中的目标会被再次复制，符号链接也不能绕过。
TARGET_DIR="$(python3 - "$SCAFFOLD_ROOT" "$REQUESTED_TARGET_DIR" <<'PY'
import pathlib, sys

try:
    source = pathlib.Path(sys.argv[1]).resolve()
    target = pathlib.Path(sys.argv[2]).resolve()
except (OSError, RuntimeError):
    print('错误: 无法解析目标目录真实路径', file=sys.stderr)
    sys.exit(1)

if target == source or source in target.parents:
    print('错误: 目标目录不能位于脚手架目录内（包括脚手架目录本身）', file=sys.stderr)
    sys.exit(1)

print(target)
PY
)"
if [[ -e "$REQUESTED_TARGET_DIR" || -L "$REQUESTED_TARGET_DIR" || -e "$TARGET_DIR" ]]; then
  echo "错误: 目标路径已存在: $TARGET_DIR" >&2
  exit 1
fi

# 仅沿用源仓库明确设置的本地身份，不使用占位身份或猜测全局配置。
if ! SOURCE_GIT_NAME="$(git -C "$SCAFFOLD_ROOT" config --local --get user.name 2>/dev/null)" ||
   ! SOURCE_GIT_EMAIL="$(git -C "$SCAFFOLD_ROOT" config --local --get user.email 2>/dev/null)" ||
   [[ -z "${SOURCE_GIT_NAME//[[:space:]]/}" || -z "${SOURCE_GIT_EMAIL//[[:space:]]/}" ]]; then
  echo "错误: 源仓库必须配置 user.name 和 user.email；请按 Git 约定确认并设置仓库本地身份后重试" >&2
  exit 1
fi

echo "==> 脚手架根: $SCAFFOLD_ROOT"
echo "==> 目标目录: $TARGET_DIR"
echo "==> APP_NAME: $APP_NAME"

mkdir -p "$TARGET_DIR"

# 两种复制方式共用排除规则，避免把本地配置、凭据和缓存带入新项目。
COPY_EXCLUDES=(
  'node_modules' '.pnpm-store' 'dist' 'build' 'coverage' '.nyc_output'
  '.cache' '.vite' '.turbo'
  '.tmp' '.temp' 'logs' '.git' '.env' '.env.*' '.ssh' '.expo'
  '/apps/mobile-app/android' '/apps/mobile-app/ios'
  '.claude'
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
  # rsync 的前导 / 相对于复制根；tar 的归档路径以 ./ 开头。
  TAR_COPY_OPTIONS=()
  for excluded in "${COPY_EXCLUDES[@]}"; do
    if [[ "$excluded" == /* ]]; then
      excluded=".$excluded"
    fi
    TAR_COPY_OPTIONS+=("--exclude=$excluded")
  done
  tar "${TAR_COPY_OPTIONS[@]}" -cf - -C "$SCAFFOLD_ROOT" . |
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

# 仅从每个应用公开的模板生成配置，绝不读取或复制真实 .env。
python3 - "$SCAFFOLD_ROOT" "$TARGET_DIR" "$APP_NAME" <<'PYENV'
from pathlib import Path
import sys
source, target, app_name = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
for name in ('server', 'admin-frontend', 'mobile-app'):
    template = source / 'apps' / name / '.env.example'
    if not template.is_file():
        continue
    content = template.read_text(encoding='utf-8')
    if name == 'server':
        content = '\n'.join('APP_NAME=' + app_name if line.startswith('APP_NAME=') else line
                            for line in content.split('\n'))
    app_dir = target / 'apps' / name
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / '.env.example').write_text(content, encoding='utf-8')
    (app_dir / '.env').write_text(content, encoding='utf-8')
PYENV
echo "✓ 从各应用 .env.example 生成独立 .env，并设置 API APP_NAME=$APP_NAME"

# 重新 git init
(
  cd "$TARGET_DIR"
  git init -q -b main
  git config --local user.name "$SOURCE_GIT_NAME"
  git config --local user.email "$SOURCE_GIT_EMAIL"
  git add .
  git commit -qm "chore: bootstrap from nest-scaffold"
  echo "✓ git init + 初始 commit 完成"
)

cat <<EOF

✅ 项目已创建: $TARGET_DIR

后续步骤：

1. 进入项目并安装依赖：
   cd "$TARGET_DIR"
   pnpm install

2. 检查并修改 apps/server/.env 与两个前端各自的 .env（不能共享服务端密钥）

3. 启动基础设施（数据库 / Redis / SeaweedFS 及管理界面）：
   docker compose --env-file apps/server/.env -f deploy/docker-compose.yml -p $APP_NAME up -d

4. 应用迁移（含基础数据）+ 填充演示数据：
   pnpm db:migrate:mysql
   NODE_ENV=development pnpm db:seed:mysql

5. 启动开发服务：
   pnpm dev:server
   # 其他终端按需运行 pnpm dev:admin / pnpm dev:mobile

6. 访问：
   - API:     http://localhost:3000
   - 管理后台: http://localhost:5173
   - Bull Board (dev): http://localhost:3000/queues
   - phpMyAdmin:    http://localhost:8081
   - pgAdmin:       http://localhost:8082
   - phpRedisAdmin: http://localhost:8080
EOF
