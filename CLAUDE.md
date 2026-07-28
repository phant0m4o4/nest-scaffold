# AGENTS.md

本文件给在本仓库工作的 AI 代理(Claude Code / Codex 等)统一行为约束。
通用部分吸收自 [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)(基于 Andrej Karpathy 对 LLM 写码常见缺陷的观察),后半段是本项目特定规则。

权衡:这些约束倾向 **谨慎优于速度**。琐碎任务(改个错字、显而易见的一行)可灵活处理,不必每次都摆全套阵仗。**写文档和对话时说人话,见第 5 条。**

---

## 通用五原则(Karpathy Guidelines)

### 1. Think Before Coding · 想清再写

**别瞎猜、别藏疑问、把权衡讲出来。**

动手前:

- **把假设说出来**。不确定就先问,而不是默默替用户决定
- **多种解读都列出来**,不要静默挑一个
- **如果有更简单的做法,讲出来**,该顶就顶,别一味顺从
- **看不懂就停**,指明"哪里看不懂"再问

### 2. Simplicity First · 先求简

**用最少的代码解决问题,不投机。**

- 用户没要的功能不加
- 单次使用的代码不抽象
- "灵活性 / 可配置性"没要求就不要
- 不存在的错误场景不做兜底
- 200 行能压到 50 行就重写

自检:"一个资深工程师会觉得这写复杂了吗?" 答案是会 → 简化。

### 3. Surgical Changes · 外科手术式改动

**只动该动的,只清理自己产生的烂摊子。**

修改既有代码时:

- 不要"顺手优化"相邻代码、注释、格式
- 没坏的别重构
- 沿用既有风格,即便你不喜欢
- 看见无关死代码 → **提一下**而不是直接删

你的改动产生的孤儿要清掉:

- 删掉因你的改动而失去引用的 import / 变量 / 函数
- **既有死代码不在你这次的请求里就别删**

自检:每一行改动都应该直接对应用户的诉求。

### 4. Goal-Driven Execution · 目标驱动

**定义成功标准,自循环到达成。**

把"动作"翻译成"可验证目标":

| 指令式       | 转成目标式                    |
| ------------ | ----------------------------- |
| "加个校验"   | "写覆盖非法输入的测试,让它过" |
| "修这个 bug" | "写一个能复现的测试,让它过"   |
| "重构 X"     | "改动前后所有测试都过"        |

多步骤任务先说一句计划:

```
1. [步骤] → 验证:[检查]
2. [步骤] → 验证:[检查]
3. [步骤] → 验证:[检查]
```

强成功标准 = 能自循环;弱标准(如"让它能跑")会一直要澄清。

**生效信号**:diff 里没有多余改动 / 不会因过度设计返工 / 澄清问题出现在落地之前而不是事后。

### 5. Plain Language · 说人话

**晦涩词汇每次出现都用括号给一句话注解,不要因为"刚讲过了"就省略。**

- 英文术语、行业黑话、缩写、jargon → **每次**出现都用括号解释一次
- 例:critical path(关键路径,卡住整体进度的那条最长链路)、BYOK(Bring Your Own Key,用户自带 API 密钥)、JWT(JSON Web Token,一种登录凭据格式)
- 唯一例外:**项目本身的核心品牌词 / 角色名 / 已固化的产品术语**(如「<产品名>」「<功能模式名>」「LLM Router」)可不再重复注解
- 注解要短,一句话讲明白;讲不明白说明自己也没搞懂,先去搞懂

自检:如果用户问"这词啥意思",说明你违反了这条。

---

## 本项目特定规则(Project Rules)

### 0. 开发规范入口(默认加载)

**任何涉及本项目代码/文档的任务,动手前先加载 `nest-scaffold` skill**(通过 Skill 工具调用,或直接读 [.claude/skills/nest-scaffold/SKILL.md](.claude/skills/nest-scaffold/SKILL.md)),按其中的决策树进入对应的 `reference/*.md`。SKILL.md 是项目开发规范(命名/分层/DTO/数据库/测试)的唯一入口,不要凭记忆或通用惯例替代它。纯对话、纯 git 操作等不涉及代码的任务可跳过。

**工程不变量**(安全/隐私/数据/分层/Redis/交付等底线)见 [.claude/skills/nest-scaffold/reference/engineering-conventions.md](.claude/skills/nest-scaffold/reference/engineering-conventions.md);循环 review 与代码审核时逐条对照,不得削弱。

### A. Git 规范:身份、隐私与开发工作流(其中隐私为硬规定,不可妥协)

**项目里(包括 git 历史、配置、代码、注释、文档)不得出现任何本机信息或本人个人信息。**

「本机/个人信息」包括但不限于:真实姓名、个人邮箱、本机用户名、本机绝对路径(`/Users/<user>/...` 这类)、主机名、机器序列号等。引用路径用相对路径或占位符,不要贴本机绝对路径。**本规则文档自身也受此约束——举例一律用占位符,不要写真实值。**

**AI 署名信息同样视为隐私信息,禁止出现在提交信息、PR 标题/描述、代码与文档中**:包括 `Co-Authored-By: Claude ...` 等 AI 合作者尾注、`Claude-Session:` / `claude.ai` 会话链接、"Generated with Claude Code" 之类的生成声明。会话链接可关联到个人 AI 账号与使用记录,属于隐私泄露;AI 代理默认附加的署名尾注一律不写。

**1. 提交 / 推送一律走 SSH key。**

- remote 必须用 SSH 形式 `git@github.com:<owner>/<repo>.git`,**不要用 HTTPS**。
- 优先使用项目内的 key 进行认证:`.ssh/id_ed25519`(私钥已被 [.gitignore](.gitignore) 屏蔽,不进 git)。在本仓库内固定该 key:
  ```
  git config --local core.sshCommand "ssh -i .ssh/id_ed25519 -o IdentitiesOnly=yes"
  ```
- **项目内没有 `.ssh/id_ed25519` 时,回退使用系统默认的 `~/.ssh`**:不设置 `core.sshCommand`(已设置的要清掉:`git config --local --unset core.sshCommand`),由 ssh 按默认规则取系统 key;**不要**把系统私钥复制进项目。
- **git 数据操作(提交/推送/拉取/看历史)一律用配置了上述 SSH key 的原生 `git`**,不要用 `gh` 做这些。
- **`gh` CLI 仅限 GitHub 平台操作**(PR 的创建/查看检查/Squash 合并、仓库设置类 `gh api`),且**每次使用前必须先 `gh auth status` 核验登录账号与本仓库署名账号一致**——`gh` 走自己的登录态,账号不一致立即停止并告知用户。工具分工速查见第 4 条与 [reference/git-commit.md](.claude/skills/nest-scaffold/reference/git-commit.md)。

**2. 提交 / 推送的署名使用 GitHub 用户名,不用本机/个人信息。本文档不写死用户名——它从 SSH 私钥(项目内的,没有则回退系统的)的注释字段动态读取(项目内私钥已被 [.gitignore](.gitignore) 屏蔽,不进 git)。**

- GitHub 用户名取自 SSH 私钥的注释字段,**本文档不出现明文**。优先用项目内的 key,没有则回退系统 key:
  ```
  KEY=.ssh/id_ed25519; [ -f "$KEY" ] || KEY=~/.ssh/id_ed25519
  GH_USER=$(ssh-keygen -l -f "$KEY" | awk '{print $3}')
  ```
- 回退到系统 key 时注意:注释字段可能不是 GitHub 用户名(比如是个人邮箱或 `user@host`)。凡是读出来的值不像 GitHub 用户名,**不要直接拿来署名**(否则违反本条的隐私硬规定),先向用户确认。
- 作者名(`user.name`)= 上述用户名;作者邮箱(`user.email`)= GitHub 提供的 noreply 邮箱 `<用户名>@users.noreply.github.com`,**不要用个人真实邮箱**。
- 在本仓库内用 **仓库级**(`git config --local`,非 `--global`)设置上述身份,避免污染或依赖全局配置:
  ```
  KEY=.ssh/id_ed25519; [ -f "$KEY" ] || KEY=~/.ssh/id_ed25519
  GH_USER=$(ssh-keygen -l -f "$KEY" | awk '{print $3}')
  git config --local user.name  "$GH_USER"
  git config --local user.email "$GH_USER@users.noreply.github.com"
  ```

**3. 提交前自检:**`git log`、`git config --local --list`、以及 diff 中不得出现上述任何本机/个人信息或 AI 署名信息(`Co-Authored-By: Claude`、`Claude-Session`、`claude.ai` 链接等);发现就先清理再提交。PR 的标题与描述同样适用。

**4. 开发分支规范(GitHub Flow)。**

- **`main` 受保护,禁止直推**:一切变更(无论大小)都走短命工作分支,经 PR(Pull Request,合并请求)合入 `main`。分支命名 `<type>/<kebab-topic>`(如 `feature/pgsql-support`、`refactor/zod-migration`),`type` 与提交规范的 type 一致。
- **PR 合并的前提是 CI 全绿**(分支保护的 required status checks(必需状态检查):`ci` 与 `docker`),`main` 因此永远处于可部署状态,持续部署(CD 方案 B)建立在这个保证之上。
- 合并方式用 **Squash merge**(压缩合并,一个 PR 压成 main 上一个提交,保持线性历史);PR 标题按提交规范书写,它就是合入 main 的提交标题。
- 工作分支**用完即清**:PR 合并后立即删除远端与本地分支及对应 worktree(工作树,同一仓库的另一份检出目录),仓库常态只保留 `main`。
- **禁止对 `main` 强推**;工作分支在 PR 评审期间可以 rebase/强推自己(改历史仅限自己的工作分支)。
- PR 的创建/检查/合并可用 `gh`(`gh pr create` / `gh pr checks` / `gh pr merge --squash`,使用前按第 1 条核验账号)或 GitHub 网页;**代码审查的判断与 Environments 发布审批必须人工完成**(网页操作),不得由代理代批。
- 首次启用(仅一次):运行 `bash .claude/skills/nest-scaffold/scripts/setup-github.sh`(gh 自动完成分支保护、仅 Squash merge、auto-delete head branches);或网页手动:Settings → Branches → Add rule(`main`):Require a pull request before merging、Require status checks to pass(勾选 `ci`、`docker`)、Block force pushes;Settings → General → Pull Requests 仅保留 Squash、勾选 Automatically delete head branches。

**5. 提交与推送规范。**

- 提交格式:`type(scope): subject`(type/scope 必须英文,subject 可中文),body 必须中文、说清"为什么改"。详见 [.claude/skills/nest-scaffold/reference/git-commit.md](.claude/skills/nest-scaffold/reference/git-commit.md),交互式提交可用 `pnpm commit`。
- **原子提交**:一次提交只做一件事;因本次改动而需要同步的文档/模板/配置放进同一个提交,不留"文档稍后补"的尾巴。
- **推送前验证**:`pnpm lint && pnpm build && pnpm test` 必须全绿(改动涉及 e2e 面时加 `pnpm test:e2e`),工作区不留未跟踪的临时文件——别把红的推给 CI。
- PR 上 CI 全绿由分支保护强制,合并后关注 CD(如已配置)的部署结果。

**6. 任务验收(四档,有风险改动必走满)。**

- 完成定义与流程见 [.claude/skills/nest-scaffold/reference/task-acceptance.md](.claude/skills/nest-scaffold/reference/task-acceptance.md):第 0 档循环 review → 第 1 档自动化测试(先定覆盖清单) → 第 2 档人工验收 → 第 3 档代码审核。
- 审查对照表见 [.claude/skills/nest-scaffold/reference/engineering-conventions.md](.claude/skills/nest-scaffold/reference/engineering-conventions.md)(工程约定)。
- 有风险 PR 的描述须含四件产物(review 记录 / 测试清单与覆盖对照 / 人工取证 / 审核导读),缺任一件可退回;报告落盘 [`reports/<里程碑>/<任务>/`](reports/README.md)。
- 纯机械改动走轻量版;把有风险改动当机械改动放水视同违规。里程碑计划只写「测什么、怎么人工验」,不得削弱该约定。
- **报告出完再询问是否提交,不自动提交**。
