# dsh-recommend 插件

DSH bundle：透明插件排行与推荐。一个包同时提供 **host 工具半** 与 **browser 排行标签半**（官方 `dsh.bundle` + `dsh.client` 双声明，见 [ADR-0003](../../docs/decisions/0003-single-package-dual-half.md)）。

## 安装

```sh
# 发布到 npm 后
dsh plugin --profile web add dsh-recommend

# 或从 GitHub（产物必须随库提交，git 源安装不触发构建）
dsh plugin --profile web add github:zp-home/dsh-recommend
```

验证与启动：

```sh
dsh --profile web --dump-config   # 应出现 # == dsh-recommend 层
dsh --profile web
```

## 功能

| 面 | 内容 |
|---|---|
| Host 工具 ×4 | `rank_plugins` 榜单 / `search_plugins` 检索 / `recommend_plugins` 目标推荐（v0 关键词）/ `sync_registry` 更新本地数据 |
| Browser 标签 | 设置页 → 插件 → 「插件排行」标签（M2 接入数据供给） |

数据流：工具读本地缓存（默认 `$DSH_HOME/dsh-recommend/registry.json`），`sync_registry` 从数据仓库（`config.dataUrl`，默认本仓库 main 分支）拉取每日重算的 registry.json。**本插件从不执行任何被收录插件的代码。**

## 配置

`cordis.patch.yml` 中的两行：

```yaml
- id: dsh-recommend
  name: dsh-recommend
  config:
    dataUrl: https://raw.githubusercontent.com/zp-home/dsh-recommend/main/data/registry.json
    cachePath: !!js dshHomePath('dsh-recommend/registry.json')
- id: dsh-recommend-client
  name: 'dsh-recommend/client'
```

## 开发（M2 落地项）

- 构建：`pnpm bundle`（tsdown），产物 `lib/` 必须**提交入库**（git 源安装不构建）
- 浏览器半装载链：官方 client-modules 按 `dsh.client` 声明供给 `/plugins/<id>/client.js`——M2 需按官方最新文档实测第三方 bundle 路径，并把结论回填 [ADR-0003](../../docs/decisions/0003-single-package-dual-half.md)
- 数据供给：host 同源 JSON 路由 或 官方 Remote 命名空间（二选一，见 [roadmap M2](../../docs/roadmap.md)）
