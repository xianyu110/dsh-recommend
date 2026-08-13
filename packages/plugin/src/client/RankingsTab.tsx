/**
 * 排行标签组件骨架（M0）。
 * M2 接入数据后：榜单表格 + 分数构成展开 + 分类筛选。
 * 当前渲染明确的占位态，避免激活即白屏。
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-settings'

export interface RankingsTabInjected {
  /** 读取榜单数据（M2 接入）。 */
  loadRankings(): Promise<unknown>
}

export type RankingsTabProps = PropsRuntime<'settings.plugins.tab'> & RankingsTabInjected

export function RankingsTab(_props: RankingsTabProps): JSX.Element {
  return (
    <div role="status">
      <p>插件排行（dsh-recommend）</p>
      <p>数据供给将在 M2 接入：host 同源 JSON 路由或官方 Remote 命名空间。</p>
      <p>当前可用：agent 工具 rank_plugins / recommend_plugins / search_plugins。</p>
    </div>
  )
}
