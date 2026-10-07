#!/usr/bin/env bash
# new-module.sh
#
# 在当前 nest-scaffold 项目中生成一个新业务模块。
#
# 用法：
#   bash scripts/new-module.sh <feature-kebab-singular> [feature-kebab-plural]
#
# 示例：
#   bash scripts/new-module.sh user-profile
#   bash scripts/new-module.sh user-profile user-profiles
#
# 生成内容：
#   apps/server/src/app/api/<feature>/                  # controller / service / module / dtos / entities / __tests__
#   apps/server/src/app/repositories/<feature>.repository.ts
#   apps/server/src/database/mysql/schemas/<features>.schema.ts （桩，需补字段）
#
# 占位符替换：
#   __feature__   → <feature-kebab-singular>           （文件名、路径、DTO schema name）
#   __Feature__   → <FeaturePascalSingular>            （类名）
#   __features__  → <feature-kebab-plural>             （表名、路由、Schema 变量）
#   __FEATURE__   → <FEATURE_UPPER_SNAKE_SINGULAR>     （常量）

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: bash $0 <feature-kebab-singular> [feature-kebab-plural]" >&2
  exit 2
fi

FEATURE_SINGULAR="$1"
FEATURE_PLURAL="${2:-${FEATURE_SINGULAR}s}"

# 校验 kebab 格式
if [[ ! "$FEATURE_SINGULAR" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "错误: <feature-kebab-singular> 必须是小写 kebab-case，如 user-profile" >&2
  exit 2
fi
if [[ ! "$FEATURE_PLURAL" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "错误: <feature-kebab-plural> 必须是小写 kebab-case" >&2
  exit 2
fi

# 推导各种命名形式
to_pascal() {
  # user-profile -> UserProfile
  echo "$1" | awk -F'-' '{
    for (i = 1; i <= NF; i++) {
      printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2)
    }
    print ""
  }'
}

to_camel() {
  # user-profile -> userProfile
  local pascal
  pascal=$(to_pascal "$1")
  echo "$(echo "${pascal:0:1}" | tr 'A-Z' 'a-z')${pascal:1}"
}

to_upper_snake() {
  # user-profile -> USER_PROFILE
  echo "$1" | tr 'a-z' 'A-Z' | tr '-' '_'
}

PASCAL_SINGULAR=$(to_pascal "$FEATURE_SINGULAR")
CAMEL_SINGULAR=$(to_camel "$FEATURE_SINGULAR")
CAMEL_PLURAL=$(to_camel "$FEATURE_PLURAL")
UPPER_SINGULAR=$(to_upper_snake "$FEATURE_SINGULAR")

# 仓库根目录（脚本可能从任何位置调用）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates/feature-module"

# 向上定位工作区或 API 应用，允许从仓库根及应用子目录调用
ROOT="$(pwd)"
while [[ "$ROOT" != "/" && ! ( -f "$ROOT/package.json" && ( -d "$ROOT/src/app" || -d "$ROOT/apps/server/src/app" ) ) ]]; do
  ROOT="$(dirname "$ROOT")"
done
if [[ -d "$ROOT/apps/server/src/app" ]]; then
  ROOT="$ROOT/apps/server"
fi
if [[ ! -f "$ROOT/package.json" || ! -d "$ROOT/src/app" ]]; then
  echo "错误: 未找到仓库根目录（要求工作区包含 apps/server/package.json + apps/server/src/app/）" >&2
  exit 1
fi

API_DIR="$ROOT/src/app/api/$FEATURE_SINGULAR"
REPO_FILE="$ROOT/src/app/repositories/$FEATURE_SINGULAR.repository.ts"
SCHEMA_FILE="$ROOT/src/database/mysql/schemas/$FEATURE_PLURAL.schema.ts"

if [[ -d "$API_DIR" ]]; then
  echo "错误: 模块目录已存在: $API_DIR" >&2
  exit 1
fi
if [[ -f "$REPO_FILE" ]]; then
  echo "错误: 仓储文件已存在: $REPO_FILE" >&2
  exit 1
fi

echo "==> 生成业务模块 [$FEATURE_SINGULAR] (类名 ${PASCAL_SINGULAR}, 属性名 ${CAMEL_SINGULAR}, Schema 变量 ${CAMEL_PLURAL}Schema, 表名 ${FEATURE_PLURAL})"

mkdir -p "$API_DIR/dtos" "$API_DIR/entities" "$API_DIR/__tests__"

# 拷贝 + 替换工具函数
render() {
  local src="$1"
  local dst="$2"
  # 注意替换顺序：先长占位符（带后缀 Camel）再短占位符；
  # 先复数再单数（避免 __features__ 被 __feature__ 部分匹配）。
  sed \
    -e "s/__featuresCamel__/$CAMEL_PLURAL/g" \
    -e "s/__featureCamel__/$CAMEL_SINGULAR/g" \
    -e "s/__Feature__/$PASCAL_SINGULAR/g" \
    -e "s/__FEATURE__/$UPPER_SINGULAR/g" \
    -e "s/__features__/$FEATURE_PLURAL/g" \
    -e "s/__feature__/$FEATURE_SINGULAR/g" \
    "$src" > "$dst"
}

render "$TEMPLATE_DIR/__feature__.module.ts.tpl"     "$API_DIR/$FEATURE_SINGULAR.module.ts"
render "$TEMPLATE_DIR/__feature__.controller.ts.tpl" "$API_DIR/$FEATURE_SINGULAR.controller.ts"
render "$TEMPLATE_DIR/__feature__.service.ts.tpl"    "$API_DIR/$FEATURE_SINGULAR.service.ts"
render "$TEMPLATE_DIR/__feature__.repository.ts.tpl" "$REPO_FILE"

render "$TEMPLATE_DIR/dtos/create-__feature__-request.dto.ts.tpl"    "$API_DIR/dtos/create-$FEATURE_SINGULAR-request.dto.ts"
render "$TEMPLATE_DIR/dtos/update-__feature__-request.dto.ts.tpl"    "$API_DIR/dtos/update-$FEATURE_SINGULAR-request.dto.ts"
render "$TEMPLATE_DIR/dtos/find-many-__feature__-request.dto.ts.tpl" "$API_DIR/dtos/find-many-$FEATURE_SINGULAR-request.dto.ts"
render "$TEMPLATE_DIR/dtos/find-one-__feature__-by-public-id-param.dto.ts.tpl" \
  "$API_DIR/dtos/find-one-$FEATURE_SINGULAR-by-public-id-param.dto.ts"

render "$TEMPLATE_DIR/entities/__feature__-public.entity.ts.tpl" \
  "$API_DIR/entities/$FEATURE_SINGULAR-public.entity.ts"

render "$TEMPLATE_DIR/__tests__/__feature__.service.unit-spec.ts.tpl" "$API_DIR/__tests__/$FEATURE_SINGULAR.service.unit-spec.ts"
render "$TEMPLATE_DIR/__tests__/__feature__.integration-spec.ts.tpl" "$API_DIR/__tests__/$FEATURE_SINGULAR.integration-spec.ts"

# 生成 schema 桩（如果不存在）
if [[ ! -f "$SCHEMA_FILE" ]]; then
  render "$SCRIPT_DIR/templates/schema.ts.tpl" "$SCHEMA_FILE"
  echo "已生成 schema 桩: $SCHEMA_FILE （需根据业务补充字段）"
else
  echo "已存在 schema 文件: $SCHEMA_FILE （跳过）"
fi

# 提示后续手动步骤
cat <<EOF

✅ 模块已生成: $API_DIR

后续手动步骤：

先进入后端应用目录，以下文件路径和命令均相对该目录：
   cd "$ROOT"

1. 在 src/database/mysql/schemas/index.ts 添加：
   export * from './$FEATURE_PLURAL.schema';

2. 在 src/app/api/api.module.ts 的 imports 加入：
   ${PASCAL_SINGULAR}Module

3. 完善以下文件中的 TODO：
   - src/database/mysql/schemas/$FEATURE_PLURAL.schema.ts  （补充表字段）
   - src/app/api/$FEATURE_SINGULAR/dtos/create-$FEATURE_SINGULAR-request.dto.ts
   - src/app/api/$FEATURE_SINGULAR/dtos/update-$FEATURE_SINGULAR-request.dto.ts
   - src/app/api/$FEATURE_SINGULAR/dtos/find-many-$FEATURE_SINGULAR-request.dto.ts
   - src/app/api/$FEATURE_SINGULAR/entities/$FEATURE_SINGULAR-public.entity.ts
   - src/app/api/$FEATURE_SINGULAR/$FEATURE_SINGULAR.service.ts （_buildFilters 与业务逻辑）
   - src/app/repositories/$FEATURE_SINGULAR.repository.ts （按需裁剪短码列）
   - src/app/api/$FEATURE_SINGULAR/__tests__/$FEATURE_SINGULAR.integration-spec.ts （默认明确失败且不连接服务；补隔离容器、配置与迁移准备后替换失败占位用例）

4. 生成并应用迁移（迁移文件随代码提交；务必带 --name）：
   pnpm db:generate:mysql --name=<kebab>
   pnpm db:migrate:mysql

5. 验证：
   pnpm lint && pnpm build
   pnpm test:unit src/app/api/$FEATURE_SINGULAR/__tests__/$FEATURE_SINGULAR.service.unit-spec.ts
   pnpm test:integration src/app/api/$FEATURE_SINGULAR/__tests__/$FEATURE_SINGULAR.integration-spec.ts
EOF
