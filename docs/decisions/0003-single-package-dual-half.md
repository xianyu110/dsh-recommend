# ADR-0003：单包双半的 bundle 形态

- 状态：**已落地（M2 验证完成）**
- 日期：2026-08

## 背景

DSH 插件有 host 半（Node）与 browser 半（Web UI）两种贡献。官方客户端插件模型要求 `dsh.client` manifest + `exports["./client"]` 的构建产物；第三方 bundle 需要同时提供工具（host）与设置页（browser）。

## 决策

`packages/plugin` 是一个 npm 包，同时声明 `dsh.bundle`（patch）与 `dsh.client`（浏览器半 manifest），patch 插入**三行**：

```yaml
- insert:
    - id: dsh-recommend
      name: dsh-recommend          # host 工具半（main；仅依赖 tools）
    - id: dsh-recommend-web
      name: 'dsh-recommend/web'    # web 数据路由半（./web；依赖 webServer）
    - id: dsh-recommend-client
      name: 'dsh-recommend/client' # browser 半（exports["./client"]）
```

## M2 实测结论（2026-08-13 回填）

1. **第三方 bundle 的 client 半装载链成立**：官方 client-modules 的 node 半扫描 loader 条目对应包的 `dsh.client` 声明，把 `exports["./client"]` 的构建产物以 `/plugins/<id>/client.js` 动态供给浏览器（官方笔记：2026-07-23-client-plugin-loading-model）。产物（lib/）必须随包提交——git 源安装不触发构建。
2. **webServer 依赖必须拆行**：本 fork 的 cordis `inject` 是强依赖（无 optional 注入）。webServer 只在 web profile 存在，若并入工具半，headless profile 安装会永久 PENDING。故工具半（`['tools']`）与数据路由半（`['webServer', 'tools']`）拆成两行，headless 下仅 web 行不激活。
3. **数据供给选型（a）同源路由**：host 半 `ctx.webServer.register({ kind: 'exact', path: '/dsh-recommend/registry.json' })`（官方 `@deepseek-ai/dsh-host-webserver` 契约），browser 半直接 fetch 同源路径。无需 Remote 命名空间、无需上游白名单（Remote 方案需改官方 apiproxy，放弃）。
4. **依赖均已发布 npm**：`@deepseek-ai/cordis@4.0.1`、`dsh-tools`/`dsh-host-webserver`/client 系列 `0.0.1-rc.1`，`tsdown` 直接可构建。

## 理由

1. 一个包、一条安装命令（`dsh plugin add github:zp-home/dsh-recommend`）同时得到工具与面板，用户心智最简单
2. 官方模型扫描的是「loader 条目对应包的 package.json 中的 dsh.client 声明」，单包三行完全在契约内
3. 产物（lib/）随包入库，git 源安装无需构建

## 代价

- client 半必须在官方 client 插件约束内写（external 平台清单、无跨插件值 import）
- 每加一个 host 半入口就要在 patch 加一行；config 需在两行 host 半间重复声明

