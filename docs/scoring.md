# 评分模型 v1

> 本文与 `scripts/score.mjs`、生成后的 `data/meta.json` 三处必须保持一致。改任何一处，必须同步另外两处（CI 校验将检查版本号与权重）。

## 1. 总览

每个仓库先过**排除规则**（不合格的不参与排名），再过**四维信号评分**，最后按公开权重加权。

## 2. 排除规则（进 registry，不进 rankings）

| 规则 | 原因字段 | 说明 |
|---|---|---|
| fork | `fork 仓库` | 不重复收录 |
| archived | `已归档` | 项目已死 |
| sizeKb == 0 | `空仓库（sizeKb=0）` | 无任何内容 |
| 描述为空 | `无描述` | 无法判断用途 |
| 描述命中占位特征 | `占位/WIP 特征` | 匹配 `/占位|待填充|placeholder|description pending|empty repo|wip|coming soon|预留/i` |

被排除条目保留在 `registry.json`（含原因），方便审计与申诉。

## 3. 四维信号（每个 ∈ [0,1]）

### 3.1 维护性 maintenance —— 权重 0.35

```
maintenance = exp(-daysSincePush / 180)
```

- `daysSincePush` = 距最近一次 push 的天数
- 半衰期 180 天：30 天未更新 ≈ 0.85，180 天 ≈ 0.37，一年 ≈ 0.13
- 选择理由：DSH 主线几乎每天发布，插件漂移是生态第一杀手；维护性是**最重要**的维度

### 3.2 热度 popularity —— 权重 0.30

```
popularity = min(1, log10(stars + 1) / 3)
```

- 对数压缩：10 stars ≈ 0.35，100 ≈ 0.67，1000 ≈ 1.0（封顶）
- 选择理由：stars 可反映受欢迎程度，但生态尚小、量级差异大，对数避免头部通吃
- 已知局限：stars 可刷、不等于使用量。真实使用量信号（npm 下载量、安装上报）在 M1.5/M4 引入后替换或加权

### 3.3 质量 quality —— 权重 0.20

```
quality = 0.4*hasLicense + 0.3*richDescription + 0.3*hasContent
```

- `hasLicense`：repo 声明了 license
- `richDescription`：描述 ≥ 40 字符
- `hasContent`：sizeKb > 0（排除空仓库后的兜底）
- 选择理由：全部来自 Search API 一次请求内的字段，**不增加 API 调用**；深扫信号（README 完整度、CI、dsh.bundle 声明）在 M1.5 加入后扩充本维度

### 3.4 生态 ecosystem —— 权重 0.15

```
ecosystem = curated ? 1.0 : 0.2
```

- `curated` = 被 dsh-external/hub 目录收录（按**仓库名**匹配：目录 URL 多为
  `dsh-external/<name>` 镜像，真实仓库在作者命名空间下，故按名匹配、URL 兜底），
  或被任一 awesome 列表提及
- 未收录默认 0.2 而不是 0：**新插件不因尚未被收录而清零**，给新项目留出上榜空间
- 选择理由：人工精选是 stars 无法操纵的独立信号；权重刻意压低，避免「榜单 = 精选列表复读」

## 4. 总分

```
score = 0.35*maintenance + 0.30*popularity + 0.20*quality + 0.15*ecosystem
```

排名并列时按 stars 降序破平。

## 5. 版本与变更流程

- 当前版本：**1**（`meta.scoringVersion`）
- 任何公式/权重/排除规则变更 = 版本 +1，并：
  1. 更新本文（含「变更记录」）
  2. 更新 `scripts/score.mjs` 中的 `SCORING_VERSION` 与 `WEIGHTS`
  3. 重新跑 `node scripts/sync.mjs` 全量重算
  4. 在 PR 描述里贴「新旧分数对比 Top20」供评审
- 权重争议走 [ADR 模板](../CONTRIBUTING.md#决策记录)，不搞「悄悄调参」

## 6. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 1 | 2026-08（M0） | 初版：四维信号 + 排除规则 + 公开权重 |
