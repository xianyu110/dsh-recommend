/**
 * 排行标签组件（M2+）：从 host 半的同源路由加载 registry + history 并渲染排行榜。
 * 数据路径：GET /dsh-recommend/registry.json、GET /dsh-recommend/history.json
 *          （由 dsh-recommend-web 行供给）；刷新走 POST /dsh-recommend/sync。
 *
 * 功能：卡片式榜单（分数条 + 四维信号徽章）、搜索 / 分类 / 四种排序 / 分页、
 *       ⭐ Star 引导、站点链接、安装命令复制、详情展开（主题/许可证/时间/深扫状态）、
 *       近 N 天综合分走势 sparkline、一键刷新数据。
 * 视觉：注入一段 scoped CSS，适配 DSH 亮/暗主题。
 */
import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export interface RankingsTabInjected {
  /** 读取榜单数据（默认走同源路由，可被注入覆盖以便测试）。 */
  loadRankings(): Promise<RegistryDoc>
  /** 读取历史趋势数据（默认走同源路由；缓存缺失时 reject，调用方降级为无趋势）。 */
  loadHistory(): Promise<HistoryDoc>
  /** 触发一次数据刷新（POST 同源 sync 路由，拉最新 registry 覆写缓存）。 */
  refreshRankings(): Promise<{ fetchedAt: string; count: number }>
}

export type RankingsTabProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'dshRecommend'>
  & RankingsTabInjected

const SIGNAL_LABELS: Record<string, string> = {
  maintenance: 'signalMaintenance',
  popularity: 'signalPopularity',
  quality: 'signalQuality',
  ecosystem: 'signalEcosystem',
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

/** 复制文本到剪贴板（clipboard API 不可用时降级 textarea）。 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

/** 迷你走势图：近 N 天综合分 polyline。 */
function Sparkline({ series, label }: { series: number[]; label: string }) {
  if (series.length < 2) return null
  const w = 120
  const h = 26
  const pad = 3
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const step = (w - 2 * pad) / (series.length - 1)
  const pts = series.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / span) * (h - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const [lastX, lastY] = pts[pts.length - 1]!.split(',')
  return (
    <svg className="dshr-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill="currentColor" />
    </svg>
  )
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
.dshr-refresh {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; font-size: 13.5px; font-family: inherit; cursor: pointer;
  color: var(--dshr-text); background: var(--dshr-surface);
  border: 1px solid var(--dshr-border); border-radius: 9px;
  transition: border-color .15s ease, color .15s ease;
}
.dshr-refresh:hover:not(:disabled) { border-color: var(--dshr-accent); color: var(--dshr-accent); }
.dshr-refresh:disabled { opacity: .55; cursor: wait; }
.dshr-msg { font-size: 12.5px; color: var(--dshr-text-tertiary); flex-basis: 100%; }
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
.dshr-trend { display: flex; align-items: center; gap: 6px; color: var(--dshr-text-tertiary); }
.dshr-spark { color: var(--dshr-accent); flex: 0 0 auto; }
.dshr-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dshr-act {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; line-height: 1; text-decoration: none; border-radius: 999px;
  padding: 6px 12px; border: 1px solid var(--dshr-border);
  color: var(--dshr-text-secondary); background: var(--dshr-surface);
  transition: border-color .15s ease, color .15s ease;
  font-family: inherit; cursor: pointer;
}
.dshr-act:hover { border-color: var(--dshr-accent); color: var(--dshr-accent); }
.dshr-act.dshr-star { color: #b8860b; border-color: #e6c25e; background: #fffaf0; font-weight: 600; }
.dshr-act.dshr-star:hover { color: #8a6a00; background: #fff3d6; border-color: #b8860b; }
body[data-ds-dark-theme] .dshr-act.dshr-star { color: #f5c518; background: rgba(245, 197, 24, .12); border-color: rgba(245, 197, 24, .45); }
body[data-ds-dark-theme] .dshr-act.dshr-star:hover { color: #ffd84d; background: rgba(245, 197, 24, .2); border-color: #f5c518; }
.dshr-act.dshr-repo { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.dshr-act.dshr-copy { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.dshr-act.dshr-copied { border-color: #2e9e5b; color: #2e9e5b; }
body[data-ds-dark-theme] .dshr-act.dshr-copied { border-color: #4cc38a; color: #4cc38a; }
.dshr-name .dshr-repo-addr {
  font-size: 12px; font-weight: 400;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--dshr-text-tertiary); text-decoration: none;
}
.dshr-name .dshr-repo-addr:hover { color: var(--dshr-accent); text-decoration: underline; }
.dshr-details { border-top: 1px dashed var(--dshr-border); padding-top: 10px; font-size: 12.5px; color: var(--dshr-text-secondary); }
.dshr-details summary { cursor: pointer; color: var(--dshr-text-tertiary); font-size: 12.5px; user-select: none; }
.dshr-details summary:hover { color: var(--dshr-accent); }
.dshr-details dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 10px 0 0; }
.dshr-details dt { color: var(--dshr-text-tertiary); white-space: nowrap; }
.dshr-details dd { margin: 0; overflow-wrap: anywhere; }
.dshr-details .dshr-topics { display: flex; flex-wrap: wrap; gap: 5px; }
.dshr-details .dshr-topic {
  font-size: 11.5px; line-height: 1; padding: 4px 8px; border-radius: 999px;
  color: var(--dshr-text-secondary); background: var(--dshr-surface-muted); border: 1px solid var(--dshr-border);
}
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

export function RankingsTab({ t, loadRankings, loadHistory, refreshRankings }: RankingsTabProps): JSX.Element {
  const [doc, setDoc] = useState<RegistryDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryDoc | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState<'score' | 'stars' | 'updated' | 'newest'>('score')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadRankings()
      .then((d) => { if (alive) setDoc(d) })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [loadRankings])

  useEffect(() => {
    let alive = true
    loadHistory()
      .then((h) => { if (alive) setHistory(h) })
      .catch(() => { if (alive) setHistory(null) }) // 历史缓存缺失 → 无趋势，不影响榜单
    return () => { alive = false }
  }, [loadHistory])

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

  /** fullName(小写) -> 每日分数序列（按日期升序）。 */
  const trendSeries = useMemo(() => {
    const map = new Map<string, number[]>()
    if (!history) return map
    const days = [...history.days].sort((a, b) => a.date.localeCompare(b.date))
    for (const day of days) {
      for (const entry of day.top) {
        const key = entry.fullName.toLowerCase()
        const list = map.get(key) ?? []
        list.push(entry.score)
        map.set(key, list)
      }
    }
    return map
  }, [history])

  const onRefresh = async () => {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const r = await refreshRankings()
      const fresh = await loadRankings()
      setDoc(fresh)
      setError(null)
      setRefreshMsg(t('refreshDone', { time: formatTime(r.fetchedAt) }))
    } catch (err) {
      setRefreshMsg(t('refreshFail', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setRefreshing(false)
    }
  }

  const onCopy = async (fullName: string) => {
    const cmd = `dsh plugin --profile web add github:${fullName}`
    try {
      await copyText(cmd)
      setCopied(fullName)
      window.setTimeout(() => setCopied((cur) => (cur === fullName ? null : cur)), 1800)
    } catch {
      setRefreshMsg(t('copyFail'))
    }
  }

  if (error) {
    return (
      <div className="dshr-wrap">
        <p role="alert">{t('loadError', { message: error })}</p>
        <button type="button" className="dshr-refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>
    )
  }
  if (!doc) {
    return <p role="status">{t('loading')}</p>
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageRows = rows.slice(start, start + PAGE_SIZE)
  const topScore = pageRows[0]?.score ?? 0
  const historyDays = history?.days.length ?? 0

  return (
    <div className="dshr-wrap">
      <div className="dshr-head">
        <h2 className="dshr-title">{t('tab')}</h2>
        <span className="dshr-meta">
          {t('meta', {
            count: String(doc.plugins.filter((p) => !p.excluded).length),
            time: formatTime(doc.meta.generatedAt),
            version: String(doc.meta.scoringVersion ?? '?'),
          })}
          {historyDays > 0 ? t('historyMeta', { days: String(historyDays) }) : null}
        </span>
      </div>

      <div className="dshr-controls">
        <input
          type="search"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          aria-label={t('searchPlaceholder')}
        />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} aria-label={t('allCategories')}>
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={view} onChange={(e) => { setView(e.target.value as typeof view); setPage(1) }} aria-label={t('sortScore')}>
          <option value="score">{t('sortScore')}</option>
          <option value="stars">{t('sortStars')}</option>
          <option value="updated">{t('sortUpdated')}</option>
          <option value="newest">{t('sortNewest')}</option>
        </select>
        <button type="button" className="dshr-refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {refreshMsg ? <p className="dshr-msg" role="status">{refreshMsg}</p> : null}

      <div className="dshr-list">
        {pageRows.map((p, i) => {
          const tier = scoreTier(p.score)
          const medal = start + i === 0 ? '🥇' : start + i === 1 ? '🥈' : start + i === 2 ? '🥉' : `#${start + i + 1}`
          const series = trendSeries.get(p.fullName.toLowerCase())
          const site = normalizeSite(p.homepage, p.url)
          const scanLabel = !p.scanStatus || p.scanStatus === 'skipped'
            ? t('scanSkipped')
            : p.scanStatus === 'verified' ? t('scanVerified')
            : p.scanStatus === 'unverified' ? t('scanUnverified') : t('scanError')
          return (
            <article className="dshr-row" key={p.fullName}>
              <div className="dshr-row-top">
                <span className={`dshr-rank ${tier}`}>{medal}</span>
                <div className="dshr-name">
                  <a href={p.url} target="_blank" rel="noreferrer" title={p.fullName}>{p.fullName}</a>
                  {p.category ? <span className="dshr-cat">{p.category}</span> : null}
                  <a className="dshr-repo-addr" href={p.url} target="_blank" rel="noreferrer" title={`github.com/${p.fullName}`}>github.com/{p.fullName}</a>
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
                        {t(SIGNAL_LABELS[k] as Parameters<typeof t>[0])} <b>{v.toFixed(2)}</b>
                      </span>
                    )
                  })}
                </span>
                {series && series.length >= 2 ? (
                  <span className="dshr-trend" title={t('trendTitle', { days: String(series.length) })}>
                    <Sparkline series={series} label={t('trendTitle', { days: String(series.length) })} />
                  </span>
                ) : null}
              </div>

              {/* Star / 站点 / 安装命令；被排除（占位/WIP）仓库不引导 Star */}
              {p.excluded ? null : (
                <div className="dshr-actions">
                  <a
                    className="dshr-act dshr-star"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t('starTitle')}
                  >
                    {t('starSupport')}
                  </a>
                  {site ? (
                    <a className="dshr-act dshr-site" href={site} target="_blank" rel="noreferrer" title={t('siteTitle')}>
                      {t('site')}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className={`dshr-act dshr-copy${copied === p.fullName ? ' dshr-copied' : ''}`}
                    title={t('installTitle')}
                    onClick={() => void onCopy(p.fullName)}
                  >
                    {copied === p.fullName ? t('copied') : t('install')}
                  </button>
                </div>
              )}

              <details className="dshr-details">
                <summary>{t('details')}</summary>
                <dl>
                  {p.category ? (
                    <><dt>{t('fieldCategory')}</dt><dd>{p.category}</dd></>
                  ) : null}
                  {Array.isArray(p.topics) && p.topics.length > 0 ? (
                    <><dt>{t('fieldTopics')}</dt><dd><span className="dshr-topics">{p.topics.map((tp) => <span className="dshr-topic" key={tp}>{tp}</span>)}</span></dd></>
                  ) : null}
                  {p.license ? <><dt>{t('fieldLicense')}</dt><dd>{p.license}</dd></> : null}
                  {p.createdAt ? <><dt>{t('fieldCreated')}</dt><dd>{formatTime(p.createdAt)}</dd></> : null}
                  {p.pushedAt ? <><dt>{t('fieldPushed')}</dt><dd>{formatTime(p.pushedAt)}</dd></> : null}
                  {site ? <><dt>{t('fieldHomepage')}</dt><dd>{site}</dd></> : null}
                  <><dt>{t('fieldScan')}</dt><dd>{scanLabel}</dd></>
                  {p.excluded ? <><dt>{t('excludedReason')}</dt><dd>{p.excluded}</dd></> : null}
                </dl>
              </details>
            </article>
          )
        })}
      </div>

      <div className="dshr-pager">
        <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>{t('prevPage')}</button>
        <span className="dshr-pager-info">{t('pageInfo', { page: String(safePage), totalPages: String(totalPages) })}</span>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>{t('nextPage')}</button>
      </div>

      <p className="dshr-note">
        {t('scoreNote', { page: String(safePage), totalPages: String(totalPages), count: String(rows.length) })}
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
    license?: string | null
    topics?: string[]
    scanStatus?: 'verified' | 'unverified' | 'skipped' | 'error' | null
    signals: Record<string, number>
  }>
}

export interface HistoryDoc {
  meta?: { updatedAt?: string }
  days: Array<{
    date: string
    total: number
    ranked: number
    excluded: number
    top: Array<{ fullName: string; rank: number; score: number; stars: number; category: string | null }>
  }>
}
