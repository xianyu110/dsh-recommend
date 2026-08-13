# Contributing Guide

[English](CONTRIBUTING.md) | 中文

欢迎贡献。本项目刻意保持「数据变更不需要写代码」——大部分贡献是加信号、调权重（走流程）或提数据源。

## 我能贡献什么

| 贡献类型 | 难度 | 路径 |
|---|---|---|
| 收录自己的插件 | 1 分钟 | [提交插件表单](https://github.com/zp-home/dsh-recommend/issues/new?template=submit-plugin.yml)（打 `dsh-plugin` 话题后，每日同步会自动收录） |
| 报告错误数据（错分类/误排除/错链接） | 低 | 开 Issue，附仓库名 |
| 新增数据源或信号 | 中 | 先开 Issue 讨论 → 按 [ADR 流程](#决策记录) 写决策 → 实现 |
| 修改评分权重/公式 | 中 | 必须走完整流程（见下） |
| 修 bug / 改 UI | 中 | 常规 PR |

## 评分变更流程（强制）

1. 更新 `docs/scoring.md`（含变更记录表）
2. 更新 `scripts/score.mjs` 的 `SCORING_VERSION` 与 `WEIGHTS`
3. 本地跑 `node scripts/sync.mjs` 全量重算
4. PR 描述贴 **新旧分数 Top20 对比**（表格即可）
5. 评审通过才合入

违反此流程的评分改动会被直接关闭。

## 决策记录

任何影响对外行为或数据语义的改动，先写 ADR：复制 `docs/decisions/` 下最近的模板，编号 +1，状态标「提议」，在 Issue/PR 中评审。

## 本地开发

```sh
node scripts/sync.mjs --limit 1   # 快速冒烟（只抓 1 页，~1 秒）
node scripts/sync.mjs             # 全量（~20 秒，未认证限额够用）
node scripts/validate.mjs         # 只校验
```

CI 会跑全量 sync + validate；PR 里 data/ 未重新生成时，CI 会以「校验不过」拦住——**改评分必须重新生成 data/**。

## 提交规范

- 提交信息：`<type>(<scope>): <summary>`，type ∈ {feat, fix, docs, data, chore}
- 双语文档同步：改 README 必须同步 README.zh.md；新增文档至少提供中文版
- 不引入运行时依赖：脚本必须保持零依赖（Node 18+ 内置能力）

## Code of Conduct

友善、对事不对人。数据是公共资产，争议走公开讨论，不私下改数据。
