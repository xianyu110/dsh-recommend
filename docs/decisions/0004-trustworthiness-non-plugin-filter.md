# 0004 — 榜单可信度增强：非插件过滤 + 信号源健康度可见性

- 日期：2026-08
- 状态：已落地（评分模型 v2）
- 相关：[0001 数据与展示分离](0001-data-and-presentation-separation.md)、[0002 评分透明可复算](0002-scoring-transparency.md)

## 背景

topic 标签是弱包含信号：`dsh-plugin` 话题下混入了大量非插件仓库
（官方仓库本体、图床/桌面工具/MCP server 等，只因打了话题标签），且 `deepseek-ai/deepseek-harness`
以 9.4 万 ★ 高居榜单第 3，直接损害「透明评分」的公信力。另发现 hub 目录镜像抓取失败时会**静默降级**
为空，导致分类与 curated 精选信号（权重 0.15）全部失效而 CI 仍绿。

## 决策

1. **排除规则扩展（评分版本 1 → 2，权重不变）**：
   - 新增 `scripts/exclude-list.json` denylist：官方本体 / 明确非插件仓库，按 `owner/repo` 登记，
     排除原因透明展示（进 registry 不进 rankings，可审计）。
   - 新增 `scripts/scan.mjs` 插件性验证：对榜单前 N 名（默认 200）逐仓用 Contents API 检测
     `dsh` 声明 / `@deepseek-ai/*` 依赖 / cordis 配置 / dsh 配置 / skills 目录 / SKILL.md，
     全无特征 → `unverified` → 排除出榜（原因「未检出插件特征（深扫）」）；API 失败 → `error` 保守保留；
     未深扫 → `skipped` 保留。`sync.mjs` 变为两阶段评分（初步榜单 → 深扫 → 合并）。
2. **数据格式向后兼容扩展**（不破坏现有字段）：registry 条目新增 `scanStatus` / `scanSignals`；
   `meta` 新增 `signals.hubCatalog / awesome / deepScan / scanCounts`。
3. **健康度门禁**：hub 目录抓取失败不再无声——`fetch.mjs` 将 `error` 与 `fetchedAt` 写入 raw，
   `meta.signals.hubCatalog` 记录之，`validate.mjs` 对空目录 / 0 awesome 命中直接失败。
4. **历史与徽章**：新增 `data/history.json`（每日快照 top 100 + 总量，同天幂等，保留 366 天）
   与 `data/badges/<owner>__<name>.json`（shields endpoint 徽章，top 200），
   供趋势曲线与作者 README 徽章使用。

## 影响

- 消费端（host 工具 / 设置页标签 / 静态站）同步更新：新字段透出（详情/深扫状态/趋势/刷新/安装命令）。
- 榜单预期变化：官方本体与无插件特征的大 ★ 仓库出榜，头部回归「真插件」。
- 风险：深扫规则可能误杀真插件（如纯文档仓库）。缓解：只对 top N 深扫、error 不排除、
  denylist 人工兜底、`unverified` 在 registry 中保留原因可申诉。

## 备选方案

- 全量深扫 1900 仓库：请求数 ~3800，超出 2 小时 cron 预算，不可行；top N 深扫 + denylist 覆盖主要污染源。
- 仅靠人工维护黑名单：不可扩展，且无法覆盖单日溢出区；故与自动化深扫并用。
