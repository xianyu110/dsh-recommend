/**
 * trends.mjs — 趋势派生（M3）：读 data/history.json（history.mjs 产物，单文件 top-N
 * 每日快照），计算每个插件的窗口变化（stars/score/rank）、方向与 sparkline，
 * 并生成各类「发展最快」排行榜，写入 data/trends.json（site 排行榜页与
 * trend_plugins 工具消费）。
 *
 * 窗口口径（与 docs/trends.md 保持一致）：
 *   - 7d / 30d / 90d：取「窗口内最早可用快照」对比「最新快照」；历史不足则窗口为 null
 *   - starsDelta = 最新 - 最早；rankDelta = 最早 - 最新（正数 = 排名上升）
 *   - direction：new（firstSeen ≤ 7 天前）| rising | falling | steady
 *   - sparkline：stars 逐日序列，降采样到 ≤ 60 点
 *
 * 排行榜（data/trends.json.rankings）：
 *   - starsGain7d / starsGain30d / starsGain90d  按 stars 增量降序
 *   - rankGain30d                                 按排名上升幅度降序
 *   - downloads30d                                按 npm 月下载量降序（仅精选且有包名的）
 *   - newlyListed                                 firstSeen 在最近 7 天内的新上榜插件
 *   - certified                                   精选认证插件（按综合分降序）
 *
 * 注：history.json 只含 top-N（默认 100）快照，故趋势榜只覆盖「近期上榜过前 N」
 * 的插件；这是与「全量快照」方案的成本权衡（远端选择单文件 top-N 控制仓库体积）。
 *
 * 用法：node scripts/trends.mjs（读 data/history.json，写 data/trends.json）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
const REGISTRY_FILE = join(DATA_DIR, 'registry.json')

const WINDOWS = [7, 30, 90]
const SPARKLINE_MAX = 60

/** 读取 history.json；缺失/损坏时返回空。 */
export async function loadHistory() {
  try {
    const doc = JSON.parse(await readFile(HISTORY_FILE, 'utf8'))
    if (!Array.isArray(doc.days)) throw new Error('history.days 缺失')
    return doc
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`history.json 读取失败：${err.message}`)
    return { meta: null, days: [] }
  }
}

/** 每个插件的时间序列：date -> {stars, score, rank}。 */
function seriesByPlugin(days) {
  const series = new Map()
  for (const day of days) {
    const date = day.date
    for (const s of day.top ?? []) {
      let list = series.get(s.fullName)
      if (!list) {
        list = []
        series.set(s.fullName, list)
      }
      list.push({ date, stars: s.stars, score: s.score, rank: s.rank })
    }
  }
  return series
}

/** 窗口 delta：取窗口内最早（含边界）与最新快照对比。 */
function windowDelta(series, latest, windowDays) {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10)
  const inWindow = series.filter((s) => s.date >= cutoff)
  const first = inWindow[0]
  if (!first) return null
  return {
    stars: latest.stars - first.stars,
    score: Math.round((latest.score - first.score) * 10000) / 10000,
    rank: first.rank !== null && latest.rank !== null ? first.rank - latest.rank : null,
  }
}

/** 降采样 sparkline（stars）：≤ SPARKLINE_MAX 点逐日，超出均匀抽点。 */
function sparkline(series, maxPoints = SPARKLINE_MAX) {
  if (series.length <= maxPoints) return series.map((s) => s.stars)
  const step = series.length / maxPoints
  const out = []
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(series[Math.min(series.length - 1, Math.floor(i * step))].stars)
  }
  return out
}

function directionOf(delta7, delta30, firstSeen) {
  const daysKnown = Math.max(1, (Date.now() - new Date(firstSeen).getTime()) / 86_400_000)
  if (daysKnown <= 7) return 'new'
  const d = delta30 ?? delta7
  if (!d) return 'steady'
  if (d.score > 0.01 && (d.rank ?? 0) > 0) return 'rising'
  if (d.score < -0.01 && (d.rank ?? 0) < 0) return 'falling'
  return 'steady'
}

/** 主入口：派生全部趋势与排行榜。 */
export async function deriveTrends() {
  const history = await loadHistory()
  const days = history.days ?? []
  const meta = {
    generatedAt: new Date().toISOString(),
    historyStart: days[0]?.date ?? null,
    historyDays: days.length,
    windows: WINDOWS,
    source: 'data/history.json',
  }
  if (days.length === 0) {
    const empty = { meta, trends: [], rankings: {} }
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(join(DATA_DIR, 'trends.json'), JSON.stringify(empty, null, 2))
    return empty
  }

  const series = seriesByPlugin(days)
  const latestDay = days[days.length - 1]
  const latestBy = new Map((latestDay.top ?? []).map((s) => [s.fullName, s]))

  // 当前 registry 的 certified / npm 数据（仅精选插件有），供认证榜与下载榜
  let registryPlugins = []
  try {
    registryPlugins = JSON.parse(await readFile(REGISTRY_FILE, 'utf8')).plugins ?? []
  } catch { /* registry 缺失时认证/下载榜为空 */ }
  const regBy = new Map(registryPlugins.map((p) => [p.fullName, p]))

  const trends = []
  for (const [fullName, list] of series) {
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted[sorted.length - 1]
    const firstSeen = sorted[0].date
    const deltas = {}
    for (const w of WINDOWS) {
      deltas[`${w}d`] = windowDelta(sorted, latest, w)
    }
    const cur = latestBy.get(fullName)
    const reg = regBy.get(fullName)
    trends.push({
      fullName,
      firstSeen,
      lastSeen: latest.date,
      current: cur
        ? {
            stars: cur.stars,
            score: cur.score,
            rank: cur.rank,
            certified: reg?.certified ?? false,
            npmWeekly: reg?.npmWeekly ?? null,
            npmMonthly: reg?.npmMonthly ?? null,
          }
        : null,
      deltas,
      direction: directionOf(deltas['7d'], deltas['30d'], firstSeen),
      sparkline: sparkline(sorted.map((s) => ({ stars: s.stars }))),
    })
  }

  // 排行榜：只算最新一天还在榜上的插件
  const ranked = trends.filter((t) => t.current && t.current.rank !== null)
  const byDelta = (w, key) => (a, b) => (b.deltas[`${w}d`]?.[key] ?? -Infinity) - (a.deltas[`${w}d`]?.[key] ?? -Infinity)
  const top = (list, n = 20) => list.slice(0, n)

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const withDownloads = ranked
    .map((t) => ({ t, npm: t.current?.npmMonthly ?? null }))
    .filter((x) => x.npm != null)
    .sort((a, b) => b.npm - a.npm)
    .map(({ t, npm }) => ({ ...t, current: { ...t.current, npmMonthly: npm } }))

  const rankings = {
    starsGain7d: top([...ranked].sort(byDelta(7, 'stars')).filter((t) => t.deltas['7d'])),
    starsGain30d: top([...ranked].sort(byDelta(30, 'stars')).filter((t) => t.deltas['30d'])),
    starsGain90d: top([...ranked].sort(byDelta(90, 'stars')).filter((t) => t.deltas['90d'])),
    rankGain30d: top([...ranked].sort(byDelta(30, 'rank')).filter((t) => t.deltas['30d']?.rank)),
    downloads30d: top(withDownloads),
    newlyListed: top(ranked.filter((t) => t.firstSeen >= sevenDaysAgo).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))),
    certified: top(ranked.filter((t) => t.current?.certified).sort((a, b) => b.current.score - a.current.score)),
  }

  const doc = { meta, trends, rankings }
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(join(DATA_DIR, 'trends.json'), JSON.stringify(doc, null, 2))
  return doc
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const doc = await deriveTrends()
  console.log(
    `趋势已写入 data/trends.json（历史 ${doc.meta.historyDays} 天，插件 ${doc.trends.length} 个；` +
      `star 7d 榜 ${doc.rankings.starsGain7d.length} · 30d 榜 ${doc.rankings.starsGain30d.length} · ` +
      `排名上升 ${doc.rankings.rankGain30d.length} · 下载榜 ${doc.rankings.downloads30d.length} · ` +
      `新增 ${doc.rankings.newlyListed.length} · 精选 ${doc.rankings.certified.length}）`,
  )
}