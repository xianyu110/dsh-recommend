# dsh-recommend

> DeepSeek Harness（DSH）插件生态的**透明排行与推荐**：每日自动抓取全 GitHub 的 `dsh-plugin` 话题仓库，按公开的评分模型打分排序，以 DSH bundle 插件 + 静态站的形式消费同一份数据。

[English](README.md) | 中文 · [设计文档](docs/DESIGN.md) · [评分模型](docs/scoring.md) · [路线图](docs/roadmap.md) · [数据](data/rankings.json)

## 它解决什么

DSH 的信条是「一切皆插件」，但 600+ 个话题仓库里混着占位仓库、WIP 和真插件，找插件靠翻仓库列表。WhaleHub 只按 Stars 排序，兼容性雷达只查兼容性，**没有人做「评分 + 排行 + 推荐」**——这是本项目的定位：

- **透明**：评分公式、权重、全部原始数据都在这个仓库里，任何人可复算
- **自动化**：GitHub Actions 每日全量重算，数据永不人工维护
- **三端消费同一份数据**：`data/registry.json` 是唯一事实源，排行网站、DSH 插件、外部工具共用

## 快速开始

### 看排行（不用装任何东西）

打开静态站（GitHub Pages 部署后）：或者直接看 [`data/rankings.json`](data/rankings.json)。

### 在 DSH 里用（M2 起可用）

```sh
dsh plugin --profile web add github:zp-home/dsh-recommend
dsh --profile web --dump-config   # 验证挂载
dsh --profile web
```

安装后获得：
- 三个模型可用工具：`rank_plugins` / `recommend_plugins` / `search_plugins` / `sync_registry`
- 设置页「插件排行」标签页（浏览器半，M2 落地）

### 自己重跑数据管道

```sh
# 需要 Node 18+
node scripts/sync.mjs            # fetch → score → validate 全量重算
node scripts/validate.mjs        # 只校验
```

未设置 `GITHUB_TOKEN` 时使用未认证限额（够跑一轮）；在 CI 中 GitHub 自动注入 token。

## 仓库结构

```
data/           每日生成的 registry.json / rankings.json / meta.json（Git 即数据库）
scripts/        fetch（采集）→ score（过滤+评分）→ validate（门禁）→ sync（总入口）
src/            插件源码（host 工具半 + web 路由半 + browser 设置页半），构建产物 lib/
cordis.patch.yml 插件配置层（bundle patch）
site/           静态排行站（零构建，直接吃 data/rankings.json）
docs/           设计 / 评分模型 / 路线图 / 决策记录
.github/        Actions（每日 cron + PR 校验）与提交插件表单
```

> 仓库根目录即插件包（`dsh.bundle` + `dsh.client` 双声明），`dsh plugin add github:zp-home/dsh-recommend` 一键安装。

## 数据源

| 源 | 内容 | 用途 |
|---|---|---|
| GitHub Search API `topic:dsh-plugin` | 全部公开仓库 + stars/更新时间/license/size 等 | 主数据源 |
| [hub 目录公开镜像](https://github.com/0xsline/awesome-deepseek-harness) | 官方精选目录与分类（hub 组织仓库私有，经每日镜像） | 分类映射 + 生态信号 |
| 三个 awesome 列表 | 社区人工精选 | 生态信号 |
| npm registry（M1.5+） | 下载量 | 真实使用量信号 |

## 收录与免责

**收录不等于安全背书。** 本仓库只做只读数据分析，从不执行任何被收录插件的代码。安装第三方插件前请自行审查源码、权限与许可证。详见 [SECURITY.md](SECURITY.md)。

## 社区与贡献

- 提交插件收录：[Issue 表单](https://github.com/zp-home/dsh-recommend/issues/new?template=submit-plugin.yml)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 上游生态：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [`dsh-plugin` 话题](https://github.com/topics/dsh-plugin)

## License

MIT
