# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。`data/` 的数据变化另有自动记录（每日 sync 提交的 git 历史本身就是变更日志）。

## [Unreleased]

### 新增

- 排行榜新增「按最新发布」排序视图（静态站 + 设置页排行标签），按仓库创建时间倒序
- 榜单卡片新增联动链接（静态站 + 设置页排行标签）：**⭐ Star 支持作者** 引导按钮（打开仓库点 Star 感谢作者）、**仓库地址** 链接（`github.com/owner/name`），有主页/静态站的插件额外显示 **🌐 站点** 链接；静态站页脚新增本仓库源码链接（含 Star 引导）
- 静态站渲染对 GitHub API 文本（仓库名 / 描述 / 主页 / 排除原因）统一做 HTML 转义，防止特殊字符破坏卡片布局
- 榜单分页：每页 50 条（静态站 + 设置页排行标签），全部插件可翻页浏览；搜索 / 分类 / 排序变化自动回到第 1 页；排名与奖牌按全局位置连续显示
- 仓库地址链接上移到卡片顶部（插件名下方等宽字体展示），底部操作行只保留 ⭐ Star 支持作者 与 🌐 站点
- npm 发布（`dsh-recommend@0.2.0`）：新增 npm 安装方式（国内可走 npmmirror 镜像）；package.json 补齐 repository/homepage/keywords/author 元数据；README 增加三种安装方式与国内数据源（jsDelivr）提示
- 手动收录清单（`scripts/manual-repos.json`）：兜底 Search API 永远取不到的仓库（单日仓库数 ≥1000 的溢出区），按 `owner/repo` 填写后由 `/repos` 接口抓取合并，不改变 registry 结构

### 变更

- 静态站默认主题改为浅色（原为深色底）
- 数据自动同步频率：每日 03:17 UTC → 每 2 小时（cron `17 */2 * * *`）

### 修复

- 时间展示：registry 生成时间由 ISO 字符串（如 `2026-08-13T21:27:05.874Z`）改为本地可读格式（如 `2026-08-14 05:27（UTC+8）`），静态站 / 设置页排行标签 / sync_registry 输出三处统一
- 全量抓取突破 GitHub Search API 1000 条上限：`scripts/fetch.mjs` 改为按 `created` 日期区间分桶 + 递归拆分（单查询最多 1000 条、单日最多 1000 条是 API 硬限制，单日超限时告警截断并注明不完整）；话题仓库数 >1000 后全量请求数达百级，需配 `GITHUB_TOKEN`（CI 已注入，不受影响）

### 新增（M0 骨架）

- 数据管道 v0：`scripts/fetch.mjs`（GitHub topic 抓取 + hub 目录 + awesome 列表）、`scripts/score.mjs`（排除规则 + 四维评分）、`scripts/validate.mjs`（CI 门禁）、`scripts/sync.mjs`（总入口）
- 评分模型 v1：维护性 0.35 / 热度 0.30 / 质量 0.20 / 生态 0.15，公式公开可复算（`docs/scoring.md`）
- `data/registry.json` / `rankings.json` / `meta.json` 全量数据
- 文档：DESIGN / scoring / roadmap / ADR ×3 / CONTRIBUTING（双语）/ SECURITY / AGENTS
- GitHub Actions：每日 cron 同步 + PR 校验
- DSH bundle 插件脚手架（`packages/plugin`）：host 工具半 + browser 设置页半骨架
- 静态站骨架（`site/`）

## [0.1.0] - 2026-08

### 首个版本

- 项目启动（M0）
