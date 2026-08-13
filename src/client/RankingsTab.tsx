/**
 * 排行标签组件（M2）：从 host 半的同源路由加载 registry 并渲染排行榜。
 * 数据路径：GET /dsh-recommend/registry.json（由 dsh-recommend-web 行供给）。
 *
 * 视觉：卡片式榜单列表（注入一段 scoped CSS），描述占整行、文字正常换行，
 * 字号与留白按「正经排行榜页」的体量设计（比紧凑表格大一号）。
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

const SIGNAL_ORDER = ['maintenance', 'popularity', 'quality', 'ecosystem'] as const

/** 分数分级配色。 */
function scoreTier(score: number): string {
  if (score >= 0.85) return 'gold'
  if (score >= 0.65) return 'accent'
  if (score >= 0.5) return 'neutral'
  return 'dim'
}

const CSS = `
.dshr-wrap { display: flex; flex-direction: column; gap: 16px; }
.dshr-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
.dshr-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--dsw-alias-label-primary, #e8eaf0); }
.dshr-meta { font-size: 12.5px; color: var(--dsw-alias-label-tertiary, #7c8696); }
.dshr-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dshr-controls input[type="search"] {
  flex: 1 1 220px; min-width: 200px;
  padding: 9px 13px; font-size: 14px; color: var(--dsw-alias-label-primary, #e8eaf0);
  background: var(--dsw-alias-bg-container-2, #171a21);
  border: 1px solid var(--dsw-alias-border-1, #2a2f3a); border-radius: 9px; outline: none;
}
.dshr-controls input[type="search"]:focus { border-color: var(--dsw-alias-accent, #4d6bfe); }
.dshr-controls select {
  padding: 9px 12px; font-size: 14px; color: var(--dsw-alias-label-primary, #e8eaf0);
  background: var(--dsw-alias-bg-container-2, #171a21);
  border: 1px solid var(--dsw-alias-border-1, #2a2f3a); border-radius: 9px; outline: none; cursor: pointer;
}
.dshr-list { display: flex; flex-direction: column; gap: 10px; }
.dshr-row {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px; border: 1px solid var(--dsw-alias-border-1, #2a2f3a); border-radius: 12px;
  background: var(--dsw-alias-bg-container-2, #171a21);
  transition: border-color .15s ease, background .15s ease;
}
.dshr-row:hover { border-color: var(--dsw-alias-border-2, #3a4150); }
.dshr-row-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dshr-rank {
  flex: 0 0 auto; min-width: 34px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: var(--dsw-alias-label-secondary, #9aa3b2);
  border-radius: 8px; background: var(--dsw-alias-bg-container-3, #1d2129);
}
.dshr-rank.gold { color: #f5c518; }
.dshr-rank.accent { color: #7f9bff; }
.dshr-rank.dim { color: #6b7484; }
.dshr-name { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshr-name a {
  font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary, #e8eaf0);
  text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dshr-name a:hover { color: var(--dsw-alias-accent, #4d6bfe); }
.dshr-cat { font-size: 12px; color: var(--dsw-alias-label-tertiary, #7c8696); }
.dshr-right { margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 16px; }
.dshr-stars { font-size: 13.5px; color: var(--dsw-alias-label-secondary, #9aa3b2); white-space: nowrap; }
.dshr-score { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.dshr-score .num { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.dshr-score .num.gold { color: #f5c518; }
.dshr-score .num.accent { color: #7f9bff; }
.dshr-score .num.neutral { color: #a8b2c2; }
.dshr-score .num.dim { color: #6b7484; }
.dshr-desc {
  font-size: 13.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary, #9aa3b2);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.dshr-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshr-bar { flex: 1 1 160px; height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-container-3, #1d2129); overflow: hidden; }
.dshr-bar > i { display: block; height: 100%; border-radius: 999px; }
.dshr-bar > i.gold { background: #f5c518; }
.dshr-bar > i.accent { background: #4d6bfe; }
.dshr-bar > i.neutral { background: #a8b2c2; }
.dshr-bar > i.dim { background: #6b7484; }
.dshr-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dshr-pill {
  font-size: 12px; line-height: 1; padding: 5px 9px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #9aa3b2);
  background: var(--dsw-alias-bg-container-3, #1d2129);
  border: 1px solid var(--dsw-alias-border-1, #2a2f3a);
}
.dshr-pill b { font-weight: 600; color: var(--dsw-alias-label-primary, #e8eaf0); }
.dshr-note { font-size: 12.5px; color: var(--dsw-alias-label-tertiary, #7c8696); }
`

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

  useEffect(() => {
    if (document.getElementById('dshr-rankings-css')) return
    const style = document.createElement('style')
    style.id = 'dshr-rankings-css'
    style.textContent = CSS
    document.head.appendChild(style)
  }, [])

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

  const topScore = rows[0]?.score ?? 0

  return (
    <div className="dshr-wrap">
      <div className="dshr-head">
        <h2 className="dshr-title">插件排行</h2>
        <span className="dshr-meta">
          共 {doc.plugins.filter((p) => !p.excluded).length} 个插件 · 数据 {doc.meta.generatedAt ?? ''} · 评分模型 v{doc.meta.scoringVersion ?? '?'}
        </span>
      </div>

      <div className="dshr-controls">
        <input
          type="search"
          placeholder="搜索名称 / 描述 / 分类…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索插件"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="分类筛选">
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="排序方式">
          <option value="score">按综合分</option>
          <option value="stars">按热度（★）</option>
          <option value="updated">按最近更新</option>
        </select>
      </div>

      <div className="dshr-list">
        {rows.map((p, i) => {
          const tier = scoreTier(p.score)
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`
          return (
            <article className="dshr-row" key={p.fullName}>
              <div className="dshr-row-top">
                <span className={`dshr-rank ${tier}`}>{medal}</span>
                <div className="dshr-name">
                  <a href={p.url} target="_blank" rel="noreferrer" title={p.fullName}>{p.fullName}</a>
                  {p.category ? <span className="dshr-cat">{p.category}</span> : null}
                </div>
                <div className="dshr-right">
                  <span className="dshr-stars">★ {p.stars}</span>
                  <span className="dshr-score">
                    <span className={`num ${tier}`}>{p.score.toFixed(3)}</span>
                  </span>
                </div>
              </div>

              {p.description ? <p className="dshr-desc">{p.description}</p> : null}

              <div className="dshr-foot">
                <span className="dshr-bar"><i className={tier} style={{ width: `${Math.round((p.score / (topScore || 1)) * 100)}%` }} /></span>
                <span className="dshr-pills">
                  {SIGNAL_ORDER.map((k) => {
                    const v = p.signals?.[k]
                    return v === undefined ? null : (
                      <span className="dshr-pill" key={k}>
                        {SIGNAL_LABELS[k]} <b>{v.toFixed(2)}</b>
                      </span>
                    )
                  })}
                </span>
              </div>
            </article>
          )
        })}
      </div>

      <p className="dshr-note">
        显示 {rows.length} 条（截断到前 100）· 综合分 = 0.35 维护性 + 0.30 热度 + 0.20 质量 + 0.15 生态 · 收录 ≠ 安全背书
      </p>
    </div>
  )
}

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
