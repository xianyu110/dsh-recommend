# dsh-recommend 静态排行站

零构建：GitHub Pages（或任意静态托管）直接服务本仓库根目录即可。

```sh
# 本地预览（任意静态服务器，例如 npx serve 或 python -m http.server）
npx serve .          # 或 python -m http.server 8000
# 打开 http://localhost:8000/site/
```

实现：`index.html` 加载 `../data/rankings.json`（Pages 上同一仓库内可跨目录 fetch）。

## 功能

- 榜单表格：排名 / 仓库 / 描述 / ★ / 分数 / 各维度信号（可展开）
- 搜索过滤 + 分类筛选
- 多视图：综合分 / 热门（stars）/ 最新（pushedAt）
- 「被排除仓库」切换查看（标注原因）

## 数据契约

只依赖 `data/rankings.json` 与 `data/registry.json` 的顶层形状（`{ meta, rankings }` / `{ meta, plugins }`）。结构变更是破坏性变更（见 AGENTS.md 改动规则 2）。
