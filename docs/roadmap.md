# 路线图

> 状态标注：✅ 已落地 · 🔨 进行中 · ⏳ 未开始。当前阶段：**M1 中**。

## M1 — 数据层与静态站（第 1 周）🔨

- ✅ 数据管道 v0（fetch / score / validate / sync，零依赖）
- ✅ 排除规则（占位/空仓库/fork/归档）
- ✅ 评分模型 v1 + 文档 + meta 快照
- ✅ `data/registry.json` / `rankings.json` 全量生成
- ✅ GitHub Actions：每日 cron 同步（sync.yml）+ PR 校验（validate.yml）
- 🔨 静态排行站 site/（榜单表格 + 搜索 + 分类筛选 + 多视图）
- ⏳ 发布动作：打 `dsh-plugin` 话题、awesome 列表 PR、hub 收录
- ⏳ 提交插件 Issue 表单上线

**M1 验收**：打开网站能看到 200+ 插件带分数与排名；`data/` 每日自动更新。

## M1.5 — 深扫与信号增强（第 2 周）

- ⏳ 逐仓库深扫（仅对榜单前 N 名）：检测 `dsh.bundle` 声明、README 长度、CI 存在性，扩充 quality 维度
- ⏳ npm registry 下载量信号（生态信号或 popularity 修正项）
- ⏳ 联动兼容性雷达：把 AdamPlatin123/awesome-dsh-plugins 的兼容性结论作为独立信号（或展示列）
- ⏳ 联动 hub：双向「收录状态」展示与同步

## M2 — DSH bundle 插件 ✅ 已完成（真机验证通过）

- ✅ 插件实现（仓库根即 bundle：`src/` → `lib/`）：
  - host 半：`rank_plugins` / `recommend_plugins` / `search_plugins` / `sync_registry` 四工具
  - web 半：同源路由 `/dsh-recommend/registry.json`（`ctx.webServer.register`，官方契约）
  - browser 半：设置页「插件排行」标签（`settings.plugins.tab` 贡献，已接数据）
- ✅ 验证项全部落地（结论回填 [ADR-0003](decisions/0003-single-package-dual-half.md)）：
  - client 半装载链：client-modules 自动供给 `/plugins/dsh-recommend/client.js`（实测 200）
  - **踩坑**：client 半不能是独立 loader 行（host 会 import 它 → `window is not defined` 整个 profile 崩）
  - 仓库根即插件包（`github:` 安装取根 package.json，子目录会变成无 bundle 的普通依赖）
- ✅ **真机安装验证**（2026-08-13，本机 dsh 0.1.0-rc.5 web profile）：
  - `dsh plugin --profile web add github:zp-home/dsh-recommend` 一键安装 ✓
  - `--dump-config` 显示 `# == dsh-recommend` 层与两行 host 半 ✓
  - `/dsh-recommend/registry.json` 实测 200（723KB 真实数据）✓
  - `/plugins/dsh-recommend/client.js` 实测 200（`__ModuleLoader__.load` 契约）✓
- ⏳ 唯一剩余：**重启你的 dsh web 实例**后，设置页 → 插件 → 「插件排行」标签可见

**M2 验收**：装完插件，设置页出现排行标签，agent 能调用四个工具并给出有据可查的推荐。

## M3 — 推荐逻辑 v1

- ⏳ `recommend_plugins` 从关键词规则升级：结合用户工作区特征（语言/描述）的简单打分推荐
- ⏳ 人工精选层：每月 Top 榜 + 编辑推荐（与自动榜分开展示）
- ⏳ 用户反馈通道（👍/👎 → 修正推荐，隐私默认关）

## M4 — 生态运营

- ⏳ 徽章（插件作者可挂 README）
- ⏳ 月度生态报告（数据即内容，天然传播）
- ⏳ 与 WhaleHub / awesome 列表 / hub 互相导流
- ⏳ 安装量遥测（可选、默认关闭、只上报聚合计数）

## 长期候选

- 多语言榜单站、历史趋势曲线（数据已含时间戳，天然支持）
- 质量分级徽章（类似 AdamPlatin 的 兼容/关注/需适配）
- 插件 AI 分析（参考 skillhub 模式：对榜单插件做语义摘要/能力画像/风险提示）——**待评估 ROI**，先观察社区需求与调用成本再决定
