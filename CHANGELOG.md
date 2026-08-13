# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。`data/` 的数据变化另有自动记录（每日 sync 提交的 git 历史本身就是变更日志）。

## [Unreleased]

### 修复

- 时间展示：registry 生成时间由 ISO 字符串（如 `2026-08-13T21:27:05.874Z`）改为本地可读格式（如 `2026-08-14 05:27（UTC+8）`），静态站 / 设置页排行标签 / sync_registry 输出三处统一

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
