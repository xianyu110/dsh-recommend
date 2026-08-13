# 安全策略（SECURITY）

## 立场声明

**本仓库不执行任何被收录插件的代码。** 它是只读的元数据分析项目：

- 数据管道只调用 GitHub API 与 raw.githubusercontent.com 读取元数据（stars、描述、更新时间、license、size 等）
- 从不 clone、从不安装、从不运行被收录仓库的任何文件
- 从不读取被收录仓库的 secrets/环境变量
- DSH 插件半只读取 `data/registry.json` 格式的 JSON 数据并做展示/检索

## 收录不等于背书

**收录 / 上榜 / 高分 ≠ 安全审计通过。** 榜单反映的是维护性、热度、文档质量与精选收录等元数据信号，**不包含**代码审计、供应链审计或运行时行为评估。安装任何第三方插件前，请自行审查：

- 插件源码与权限声明
- 依赖树与许可证
- 是否请求了超出其功能所需的权限（bash 全权、网络、凭据读取等）
- 安装时是否运行构建/安装脚本（git 源安装的 `prepare` 脚本会以你的用户权限执行）

参考：[DeepSeek Harness 官方发布教程](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md) 对 git 安装授权的警告。

## 数据完整性

- `data/*.json` 由每日 CI 全量重算生成，任何对数据的修改都记录在 git 历史中
- 评分公式公开（`docs/scoring.md`），任何权重/公式变更走评审流程
- 发现错误数据（错误分类、误排除、错误链接）请开 Issue 或 PR

## 报告漏洞

如果你发现本仓库自身的漏洞（例如：数据管道被滥用、推荐结果可被系统性操纵、DSH 插件半的注入风险），请：

1. 优先开一个**不包含利用细节**的公开 Issue 讨论
2. 或发送邮件至维护者邮箱（TODO：发布时填写）
3. 请勿在公开渠道传播利用方法

## 自动化安全边界

- CI 使用 `GITHUB_TOKEN`（权限最小化：`contents: write` 仅用于数据提交）
- 管道输出只写入 `data/`，不接触其他路径
- 每日 cron 的失败会留下红叉（可见性 = 安全：数据过期会被看到）
