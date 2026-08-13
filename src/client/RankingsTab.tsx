/**
 * 排行标签组件（M2）：从 host 半的同源路由加载 registry 并渲染榜单。
 * 数据路径：GET /dsh-recommend/registry.json（由 dsh-recommend-web 行供给）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export interface RankingsTabInjected {
  /** 读取榜单数据（默认走同源路由，可被注入覆盖以便测试）。 */
  loadRankings(): Promise<RegistryDoc>
}

export type RankingsTabProps = PropsRuntime<'settings.plugins.tab'> & RankingsTabInjected

const SIGNAL_LABELS: Record<string, string> = {
  maintenance: '维护性',
  popularity: '热度',
  quality: '质量',
  ecosystem: '生态',
}

export function RankingsTab({ loadRankings }: RankingsTabProps): JSX.Element {
  const [doc, setDoc] = useState<RegistryDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState<'score' | 'stars' | 'updated'>('score')

  useEffect(() => {
    let alive = true
    loadRankings()
      .then((d) => { if (alive) setDoc(d) })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [loadRankings])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of doc?.plugins ?? []) if (p.category) set.add(p.category)
    return [...set].sort()
  }, [doc])

  const rows = useMemo(() => {
    if (!doc) return []
    const q = query.toLowerCase()
    const list = doc.plugins
      .filter((p) => !p.excluded)
      .filter((p) => !category || p.category === category)
      .filter((p) => `${p.fullName} ${p.description ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q))
    list.sort((a, b) => {
      if (view === 'stars') return b.stars - a.stars
      if (view === 'updated') return (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '')
      return b.score - a.score
    })
    return list.slice(0, 100)
  }, [doc, query, category, view])

  if (error) {
    return <p role="alert">榜单数据加载失败：{error}（先调用 sync_registry 工具，或确认 web 行已挂载）</p>
  }
  if (!doc) {
    return <p role="status">正在加载插件榜单…</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          type="search"
          placeholder="搜索名称/描述/分类…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="分类">
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="排序">
          <option value="score">综合分</option>
          <option value="stars">热门（★）</option>
          <option value="updated">最近更新</option>
        </select>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>插件</th>
            <th style={thStyle}>描述</th>
            <th style={thStyle}>★</th>
            <th style={thStyle}>分数</th>
            <th style={thStyle}>信号</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.fullName}>
              <td style={tdStyle}>{p.score > 0.8 ? '🥇' : p.score > 0.6 ? '🥈' : p.score > 0.4 ? '🥉' : ''}</td>
              <td style={tdStyle}>
                <a href={p.url} target="_blank" rel="noreferrer">{p.fullName}</a>
              </td>
              <td style={{ ...tdStyle, color: 'var(--dsw-alias-label-secondary)' }}>{p.description ?? ''}</td>
              <td style={tdStyle}>{p.stars}</td>
              <td style={tdStyle}>{p.score.toFixed(3)}</td>
              <td style={tdStyle}>
                {Object.entries(p.signals ?? {}).map(([k, v]) => `${SIGNAL_LABELS[k] ?? k} ${v.toFixed(2)}`).join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>
        {rows.length} 条 · 数据 {doc.meta.generatedAt ?? ''} · 评分模型 v{doc.meta.scoringVersion ?? '?'}
      </p>
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--dsw-alias-border-1)' }
const tdStyle: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--dsw-alias-border-1)', verticalAlign: 'top' }

export interface RegistryDoc {
  meta: { generatedAt?: string; scoringVersion?: number }
  plugins: Array<{
    fullName: string
    url: string
    description: string | null
    stars: number
    score: number
    category: string | null
    excluded: string | null
    pushedAt: string | null
    signals: Record<string, number>
  }>
}
