#!/usr/bin/env bash
# setup-github.sh
#
# 为当前仓库一次性启用 GitHub 工程约束（GitHub Flow 所需的平台设置）：
#   1. main 分支保护：必须走 PR、必需状态检查 ci/docker、管理员同样受限、禁强推/删除
#   2. 仅允许 Squash merge，squash 提交标题取 PR 标题、正文取 PR 描述
#   3. PR 合并后自动删除远端分支（auto-delete head branches）
#
# 前置：gh CLI 已登录（gh auth login），登录账号对仓库有 admin 权限；
#       origin 为 SSH 形式 git@github.com:<owner>/<repo>.git。
# 幂等：重复执行安全（PUT/PATCH 覆盖式写入）。
#
# 用法：bash .claude/skills/nest-scaffold/scripts/setup-github.sh

set -euo pipefail

# 1) 核验 gh 登录（项目规则：使用 gh 前必须核验账号）
if ! gh auth status >/dev/null 2>&1; then
  echo "错误: gh 未登录。请先执行 gh auth login" >&2
  exit 1
fi
GH_LOGIN=$(gh api user --jq .login)

# 2) 从 origin 推导 owner/repo（要求 SSH 形式）
ORIGIN_URL=$(git remote get-url origin)
if [[ "$ORIGIN_URL" =~ ^git@github\.com:([^/]+)/(.+)$ ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]%.git}"
else
  echo "错误: origin 不是 git@github.com:<owner>/<repo>.git 形式: $ORIGIN_URL" >&2
  exit 1
fi

echo "gh 登录账号: $GH_LOGIN"
echo "目标仓库:   $OWNER/$REPO"
if [[ "$GH_LOGIN" != "$OWNER" ]]; then
  echo "提示: 登录账号与仓库 owner 不同（组织仓库属正常，请确认具有 admin 权限）"
fi
read -r -p "继续配置? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "已取消"
  exit 0
fi

# 3) main 分支保护
cat <<'JSON' | gh api -X PUT "repos/$OWNER/$REPO/branches/main/protection" --input - >/dev/null
{
  "required_status_checks": { "strict": false, "contexts": ["ci", "docker"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "✓ main 分支保护：必须 PR、必需检查 ci/docker、管理员受限、禁强推/删除"

# 4) 合并策略与自动删分支
gh api -X PATCH "repos/$OWNER/$REPO" \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY >/dev/null
echo "✓ 仅 Squash merge（标题取 PR 标题、正文取 PR 描述）+ 合并后自动删远端分支"

echo ""
echo "✅ 配置完成。注意：必需检查 ci/docker 在 CI 至少跑过一次后才会在网页设置里可见；"
echo "   新仓库请先推送一次代码触发 CI（不影响本配置的生效）。"
