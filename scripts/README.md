# 数据管道（scripts/）

零依赖（Node 18+ 内置 API）。三步流水线：

```
fetch.mjs ──► data/raw/repos.json    采集（GitHub topic + hub 目录镜像 + awesome 列表）
score.mjs ──► data/{registry,rankings,meta}.json   过滤 + 评分
validate.mjs 校验门禁（CI 用，失败 exit 1）
sync.mjs     总入口：三步顺序执行，任一步失败即红
```

## 用法

```sh
node scripts/sync.mjs              # 全量（话题仓库数 >1000 后必须配 GITHUB_TOKEN，见下）
node scripts/sync.mjs --limit 1    # 冒烟：只抓 1 页（~7s）
node scripts/fetch.mjs --dry       # 只打印原始 JSON 不落盘（调试）
node scripts/validate.mjs          # 只校验
GITHUB_TOKEN=xxx node scripts/sync.mjs   # 带 token：30 次/分，快很多
```

> ⚠️ 未认证限额只有 10 次/分：话题仓库数 ≤1000 时全量 ~1 分钟没问题；超过 1000 后
> 分桶/拆分会使请求数到百级，未认证会被 403 限流跑不完——**请配 `GITHUB_TOKEN`**
> （CI 已注入 github.token，不受影响）。

## 约定与铁律

- **主入口检测**：`import.meta.url === pathToFileURL(process.argv[1]).href`（Windows 路径安全）
- **改评分 = 三处同步**：`docs/scoring.md` → `score.mjs`（`SCORING_VERSION`/`WEIGHTS`）→ 重新生成 `data/`
- **数据源白名单**：见 `fetch.mjs` 头部注释；新增源先走 ADR
- **失败策略**：主数据源（GitHub Search）失败即红；辅助源（目录镜像/awesome）降级警告
- **限额**：未认证 Search 10 次/分（页间已加 6.5s 退避 + 403/429 Retry-After 重试 ×3）

## 已踩过的坑（2026-08 实测）

1. **dsh-external/hub 是私有组织仓库**（API/raw 全部 404）——目录走 0xsline 的每日公开镜像 CATALOG.md
2. **Search API 翻页会重复返回仓库**（结果集翻页期间漂移）——fetch 内按 full_name 去重
3. **话题仓库水分大**：661 个里 105 个被排除（82 个无描述、23 个空仓库），排除原因透明展示
4. **部分仓库描述是 mojibake**（GBK 误存进 GitHub 元数据，如 `鈥?`）——原样保留，不做猜测性修复
5. **Search API 单个查询最多返回 1000 条**（10 页 × 100，第 11 页恒为空数组；且 repository
   搜索不支持按 created 排序，sort=created 会被静默忽略）——「全量」按 `created` 日期区间
   分桶 + 递归拆分实现（`fetchTopicRepos`）：桶间无重叠、不依赖排序；某桶取满 1000 条就
   从中间日期拆成两个子桶重抓，直到不足 1000 条或拆到单日（单日仓库数 ≥1000 是 Search API
   无法绕过的极限，会告警截断）。拆桶后请求数随话题仓库数增长：未认证 10 次/分，仓库数
   >1000 时建议配 `GITHUB_TOKEN`（30 次/分）。
