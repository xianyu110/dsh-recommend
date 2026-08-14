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

const PAGE_SIZE = 50 // 每页条数

/** 分数分级配色。 */
function scoreTier(score: number): string {
  if (score >= 0.85) return 'gold'
  if (score >= 0.65) return 'accent'
  if (score >= 0.5) return 'neutral'
  return 'dim'
}

/** 插件自带静态站 / 主页：补全 scheme；空值或与仓库 URL 相同时返回 null（避免冗余链接）。 */
function normalizeSite(homepage?: string | null, repoUrl?: string): string | null {
  const h = (homepage ?? '').trim()
  if (!h) return null
  const url = h.includes('://') ? h : `https://${h}`
  return url === repoUrl ? null : url
}

/** ISO 时间戳 → 本地可读格式，如 2026-08-14 05:27（UTC+8）。解析失败原样返回，缺省显示 —。 */
function formatTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset() / 60
  const tz = off === 0 ? 'UTC' : `UTC${off > 0 ? '+' : ''}${off}`
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}（${tz}）`
}

const CSS = `
.dshr-wrap {
  --dshr-surface: #ffffff;
  --dshr-surface-muted: #f5f6f7;
  --dshr-text: #0f1115;
  --dshr-text-secondary: #61666b;
  --dshr-text-tertiary: #81858c;
  --dshr-border: rgba(0, 0, 0, .1);
  --dshr-border-hover: rgba(0, 0, 0, .16);
  --dshr-accent: #4176e6;
  display: flex; flex-direction: column; gap: 16px;
}
body[data-ds-dark-theme] .dshr-wrap {
  --dshr-surface: var(--dsw-alias-bg-layer-1, #232324);
  --dshr-surface-muted: var(--dsw-alias-bg-layer-2, #2c2c2e);
  --dshr-text: var(--dsw-alias-label-primary, #f9fafb);
  --dshr-text-secondary: var(--dsw-alias-label-secondary, #cfd3d8);
  --dshr-text-tertiary: var(--dsw-alias-label-tertiary, #adb2b8);
  --dshr-border: var(--dsw-alias-border-l2, rgba(255, 255, 255, .12));
  --dshr-border-hover: var(--dsw-alias-border-l3, rgba(255, 255, 255, .16));
  --dshr-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #5690fe);
}
.dshr-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
.dshr-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--dshr-text); }
.dshr-meta { font-size: 12.5px; color: var(--dshr-text-tertiary); }
.dshr-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dshr-controls input[type="search"] {
  flex: 1 1 220px; min-width: 200px;
  padding: 9px 13px; font-size: 14px; color: var(--dshr-text);
  background: var(--dshr-surface);
  border: 1px solid var(--dshr-border); border-radius: 9px; outline: none;
}
.dshr-controls input[type="search"]:focus { border-color: var(--dshr-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dshr-accent) 20%, transparent); }
.dshr-controls select {
  padding: 9px 12px; font-size: 14px; color: var(--dshr-text);
  background: var(--dshr-surface);
  border: 1px solid var(--dshr-border); border-radius: 9px; outline: none; cursor: pointer;
}
.dshr-controls select:focus { border-color: var(--dshr-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dshr-accent) 20%, transparent); }
.dshr-list { display: flex; flex-direction: column; gap: 10px; }
.dshr-row {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px; border: 1px solid var(--dshr-border); border-radius: 12px;
  background: var(--dshr-surface);
  transition: border-color .15s ease;
}
.dshr-row:hover { border-color: var(--dshr-border-hover); }
.dshr-row-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dshr-rank {
  flex: 0 0 auto; min-width: 34px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: var(--dshr-text-secondary);
  border-radius: 8px; background: var(--dshr-surface-muted);
}
.dshr-rank.gold { color: #f5c518; }
.dshr-rank.accent { color: var(--dshr-accent); }
.dshr-rank.dim { color: var(--dshr-text-tertiary); }
.dshr-name { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshr-name a {
  font-size: 15px; font-weight: 600; color: var(--dshr-text);
  text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dshr-name a:hover { color: var(--dshr-accent); }
.dshr-cat { font-size: 12px; color: var(--dshr-text-tertiary); }
.dshr-right { margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 16px; }
.dshr-stars { font-size: 13.5px; color: var(--dshr-text-secondary); white-space: nowrap; }
.dshr-score { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.dshr-score .num { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.dshr-score .num.gold { color: #f5c518; }
.dshr-score .num.accent { color: var(--dshr-accent); }
.dshr-score .num.neutral { color: var(--dshr-text-secondary); }
.dshr-score .num.dim { color: var(--dshr-text-tertiary); }
.dshr-desc {
  font-size: 13.5px; line-height: 1.65; color: var(--dshr-text-secondary);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.dshr-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshr-bar { flex: 1 1 160px; height: 6px; border-radius: 999px; background: var(--dshr-surface-muted); overflow: hidden; }
.dshr-bar > i { display: block; height: 100%; border-radius: 999px; }
.dshr-bar > i.gold { background: #f5c518; }
.dshr-bar > i.accent { background: var(--dshr-accent); }
.dshr-bar > i.neutral { background: var(--dshr-text-secondary); }
.dshr-bar > i.dim { background: var(--dshr-text-tertiary); }
.dshr-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dshr-pill {
  font-size: 12px; line-height: 1; padding: 5px 9px; border-radius: 999px;
  color: var(--dshr-text-secondary);
  background: var(--dshr-surface-muted);
  border: 1px solid var(--dshr-border);
}
.dshr-pill b { font-weight: 600; color: var(--dshr-text); }
.dshr-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dshr-act {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; line-height: 1; text-decoration: none; border-radius: 999px;
  padding: 6px 12px; border: 1px solid var(--dshr-border);
  color: var(--dshr-text-secondary); background: var(--dshr-surface);
  transition: border-color .15s ease, color .15s ease;
}
.dshr-act:hover { border-color: var(--dshr-accent); color: var(--dshr-accent); }
.dshr-act.dshr-star { color: #b8860b; border-color: #e6c25e; background: #fffaf0; font-weight: 600; }
.dshr-act.dshr-star:hover { color: #8a6a00; background: #fff3d6; border-color: #b8860b; }
body[data-ds-dark-theme] .dshr-act.dshr-star { color: #f5c518; background: rgba(245, 197, 24, .12); border-color: rgba(245, 197, 24, .45); }
body[data-ds-dark-theme] .dshr-act.dshr-star:hover { color: #ffd84d; background: rgba(245, 197, 24, .2); border-color: #f5c518; }
.dshr-act.dshr-repo { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.dshr-name .dshr-repo-addr {
  font-size: 12px; font-weight: 400;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--dshr-text-tertiary); text-decoration: none;
}
.dshr-name .dshr-repo-addr:hover { color: var(--dshr-accent); text-decoration: underline; }
.dshr-pager { display: flex; align-items: center; justify-content: center; gap: 10px; }
.dshr-pager button {
  padding: 7px 14px; font-size: 13px; font-family: inherit; color: var(--dshr-text);
  background: var(--dshr-surface); border: 1px solid var(--dshr-border);
  border-radius: 9px; cursor: pointer;
}
.dshr-pager button:hover:not(:disabled) { border-color: var(--dshr-accent); color: var(--dshr-accent); }
.dshr-pager button:disabled { opacity: .45; cursor: not-allowed; }
.dshr-pager-info { font-size: 13px; color: var(--dshr-text-tertiary); }
.dshr-note { font-size: 12.5px; color: var(--dshr-text-tertiary); }
`

export function RankingsTab({ loadRankings }: RankingsTabProps): JSX.Element {
  const [doc, setDoc] = useState<RegistryDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState<'score' | 'stars' | 'updated' | 'newest'>('score')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let alive = true
    loadRankings()
      .then((d) => { if (alive) setDoc(d) })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [loadRankings])

  useEffect(() => {
    const style = document.getElementById('dshr-rankings-css') ?? document.createElement('style')
    style.id = 'dshr-rankings-css'
    style.textContent = CSS
    if (!style.parentNode) document.head.appendChild(style)
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
      if (view === 'newest') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      return b.score - a.score
    })
    return list
  }, [doc, query, category, view])

  if (error) {
    return <p role="alert">榜单数据加载失败：{error}（先调用 sync_registry 工具，或确认 web 行已挂载）</p>
  }
  if (!doc) {
    return <p role="status">正在加载插件榜单…</p>
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageRows = rows.slice(start, start + PAGE_SIZE)
  const topScore = pageRows[0]?.score ?? 0

  return (
    <div className="dshr-wrap">
      <div className="dshr-head">
        <h2 className="dshr-title">插件排行</h2>
        <span className="dshr-meta">
          共 {doc.plugins.filter((p) => !p.excluded).length} 个插件 · 数据 {formatTime(doc.meta.generatedAt)} · 评分模型 v{doc.meta.scoringVersion ?? '?'}
        </span>
      </div>

      <div className="dshr-controls">
        <input
          type="search"
          placeholder="搜索名称 / 描述 / 分类…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          aria-label="搜索插件"
        />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} aria-label="分类筛选">
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={view} onChange={(e) => { setView(e.target.value as typeof view); setPage(1) }} aria-label="排序方式">
          <option value="score">按综合分</option>
          <option value="stars">按热度（★）</option>
          <option value="updated">按最近更新</option>
          <option value="newest">按最新发布</option>
        </select>
      </div>

      <div className="dshr-list">
        {pageRows.map((p, i) => {
          const tier = scoreTier(p.score)
          const medal = start + i === 0 ? '🥇' : start + i === 1 ? '🥈' : start + i === 2 ? '🥉' : `#${start + i + 1}`
          return (
            <article className="dshr-row" key={p.fullName}>
              <div className="dshr-row-top">
                <span className={`dshr-rank ${tier}`}>{medal}</span>
                <div className="dshr-name">
                  <a href={p.url} target="_blank" rel="noreferrer" title={p.fullName}>{p.fullName}</a>
                  {p.category ? <span className="dshr-cat">{p.category}</span> : null}
                  <a className="dshr-repo-addr" href={p.url} target="_blank" rel="noreferrer" title="仓库地址（打开即可 Star）">github.com/{p.fullName}</a>
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

              {/* Star / 站点联动链接（仓库地址已在卡片顶部展示）；被排除（占位/WIP）仓库不引导 Star */}
              {p.excluded ? null : (
                <div className="dshr-actions">
                  <a
                    className="dshr-act dshr-star"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    title="打开仓库，点右上角 ⭐ Star 支持作者 —— 免费，却是对作者最好的感谢"
                  >
                    ⭐ Star 支持作者
                  </a>
                  {normalizeSite(p.homepage, p.url) ? (
                    <a className="dshr-act dshr-site" href={normalizeSite(p.homepage, p.url)!} target="_blank" rel="noreferrer" title="插件静态站 / 文档">
                      🌐 站点
                    </a>
                  ) : null}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="dshr-pager">
        <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>« 上一页</button>
        <span className="dshr-pager-info">第 {safePage} / {totalPages} 页</span>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>下一页 »</button>
      </div>

      <p className="dshr-note">
        第 {safePage} / {totalPages} 页 · 共 {rows.length} 条 · 综合分 = 0.35 维护性 + 0.30 热度 + 0.20 质量 + 0.15 生态 · 收录 ≠ 安全背书
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
    createdAt: string | null
    homepage?: string | null
    signals: Record<string, number>
  }>
}
