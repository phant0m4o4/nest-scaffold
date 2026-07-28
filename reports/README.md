# 任务验收报告归档

本目录存放里程碑 / 任务的验收报告与取证材料。验收流程见 [task-acceptance.md](../.claude/skills/nest-scaffold/reference/task-acceptance.md)；审查对照的工程不变量见 [engineering-conventions.md](../.claude/skills/nest-scaffold/reference/engineering-conventions.md)。

## 目录结构

```
reports/
├── README.md
└── <里程碑>/                 # 如 m0、m1
    └── <任务>/               # 如 T1、T2
        ├── 验收报告.md       # 总结性验收报告（四档全文 + 交付物/偏差/自查）
        └── evidence/         # 可选：命令输出、截图等
```

## 注意

- 报告与 evidence **不得**含密钥、真实供应商 key、本机绝对路径、个人信息或 AI 署名信息（见仓库根 `CLAUDE.md` 规则 A）。
- PR 描述应摘要并链接到对应 `验收报告.md`，避免产物只留在会话里。
- 纯机械改动若走轻量验收，可不建目录；有风险的改动必须按 `task-acceptance.md` 四档留档。
