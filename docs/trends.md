# 趋势模型与精选认证（M3）

> 本文说明两条新增数据链路的口径：**历史趋势**（`data/history.json` + `data/trends.json`）
> 与**精选认证**（`scripts/curated.json` → `certified` 标记 + 🏅 徽章）。

## 1. 历史趋势

### 1.1 数据来源

- `data/history.json`：由 `scripts/history.mjs` 维护，单文件、每日一条快照
  （当天幂等覆盖），只保留最近 366 天，每条含榜单 top-N（默认 100）的
  `{ fullName, rank, score, stars, category }`。
- `data/trends.json`：由 `scripts/trends.mjs` 读 history.json 派生，含
  `meta`（historyStart/historyDays）、`trends`（每插件全量序列）、
  `rankings`（各类发展榜）。**趋势榜只覆盖近期进入过 top-N 的插件**
  （history.json 是 top-N 快照，非全量）。

### 1.2 窗口口径

| 窗口 | 定义 |
|---|---|
| 7d / 30d / 90d | 对比「窗口内最早可用快照」与「最新快照」；历史不足该窗口时 delta 为 `null`（不是 0） |
| starsDelta | 最新 stars − 窗口最早 stars |
| rankDelta | 窗口最早 rank − 最新 rank（正数 = 排名上升） |
| direction | `new`（firstSeen ≤ 7 天前）\| `rising` \| `falling` \| `steady` |
| sparkline | stars 逐日序列，降采样到 ≤ 60 点 |

### 1.3 排行榜（`rankings` 字段）

| 榜 | 排序键 | 说明 |
|---|---|---|
| `starsGain7d / 30d / 90d` | stars delta | 各窗口 star 增长最快 |
| `rankGain30d` | rank delta | 30 天排名上升最多 |
| `downloads30d` | npmMonthly | npm 月下载量最多（仅精选且声明了 npmPackage 的插件） |
| `newlyListed` | firstSeen | 最近 7 天新上榜插件 |
| `certified` | score | 精选认证插件（按综合分） |

> 历史数据**不可回补**：管道从本版本起才开始积累每日快照。趋势榜需要数天历史才有意义，
> 这是本项目的长期数据资产——竞品只能从自己开始积累的那天算起。

## 2. 精选认证

### 2.1 流程（全自动）

1. 作者提交 [Issue 表单](https://github.com/zp-home/dsh-recommend/issues/new?template=submit-plugin.yml)，
   勾选「申请精选认证」并填写 npm 包名（可选）；
2. 维护者审核后给 issue 打 **`approved`** 标签；
3. [curate workflow](../.github/workflows/curate.yml) 自动从 issue body 提取仓库地址与 npm 包名，
   调用 `scripts/curate.mjs` 追加到 `scripts/curated.json` 并提交；
4. 下一次 sync 时 `score.mjs` 读取 curated.json，给对应插件打 `certified: true` +
   `certifiedAt` 标记，site 与 DSH 设置页显示 🏅 徽章；
5. 认证插件同时获得 README 认证徽章（可挂自己的 README）：
   `![dsh-recommend](https://zp-home.github.io/dsh-recommend/site/badges/<owner>-<name>.svg)`

### 2.2 与评分的关系

**认证不改变评分**。`certified` 是展示层标记（区别于 `ecosystem` 信号里的 hub/awesome
精选与 v2 的深扫信任度），遵守「改评分 = 三处同步」的纪律——认证是运营激励，不是评分特权。

### 2.3 数据契约（非破坏性扩展）

`registry.json` 每条新增可选字段：`certified`（boolean）、`certifiedAt`（ISO 日期）、
`curatedIssue`（issue 号）、`npmPackage`（string|null）、`npmWeekly`/`npmMonthly`
（number|null）。既有消费端（host 工具、site、外部）忽略新字段不受影响。

## 3. 一键安装（设置页）

- 设置页排行标签每行「⬇ 安装」按钮：POST `/dsh-recommend/install`（host 构造
  `github:owner/repo` spec 并执行 `dsh plugin --profile <name> add <spec>`），
  已装检测走官方 pluginInventory Remote（moduleName 与 fullName 模糊匹配）。
- 安全边界：spec 由服务端从缓存 registry 构造（防注入）；Origin 同源校验（防 CSRF）。

## 4. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 1 | 2026-08（M3） | 新增历史趋势派生、精选认证流程、npm 下载量展示字段、设置页一键安装 |