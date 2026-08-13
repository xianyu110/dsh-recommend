# ADR-0003：单包双半的 bundle 形态

- 状态：已采纳（M0，待 M2 落地时复核）
- 日期：2026-08

## 背景

DSH 插件有 host 半（Node）与 browser 半（Web UI）两种贡献。官方客户端插件模型要求 `dsh.client` manifest + `exports["./client"]` 的构建产物；第三方 bundle 需要同时提供工具（host）与设置页（browser）。

## 决策

`packages/plugin` 是一个 npm 包，同时声明 `dsh.bundle`（patch）与 `dsh.client`（浏览器半 manifest），patch 插入两行：

```yaml
- insert:
    - id: dsh-recommend
      name: dsh-recommend          # host 半（main 入口）
    - id: dsh-recommend-client
      name: 'dsh-recommend/client'  # browser 半（exports["./client"]）
```

## 理由

1. 一个包、一条安装命令（`dsh plugin add github:xxx/dsh-recommend`）同时得到工具与面板，用户心智最简单
2. 官方模型扫描的是「loader 条目对应包的 package.json 中的 dsh.client 声明」，单包双行完全在契约内（参考官方 `@deepseek-ai/dsh-client-hmr` 等既有形态）
3. 产物（lib/）随包入库，git 源安装无需构建

## 代价与待验证

- 第三方 bundle 的 client 半装载路径（`/plugins/<id>/client.js` 供给链）在 M2 实现时须按官方最新文档实测验证
- 若验证受阻，备选：拆成两个包（bundle 包 + client 包），patch 引用后者
