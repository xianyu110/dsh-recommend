/**
 * history.mjs — 每日历史快照（趋势数据源）
 *
 * 从最新 registry.json 抽取当日快照（榜单 top N + 总量），追加/覆盖到 data/history.json：
 *   { meta: { updatedAt }, days: [ { date, total, ranked, excluded, top: [{ fullName, rank, score, stars, category }] } ] }
 * - 同一天幂等覆盖（一天一条，避免 2 小时 cron 产生 12 条同一天快照）
 * - 只保留最近 366 天
 * - 消费端：设置页排行标签 / 静态站的趋势 sparkline（读 history.json）
 *
 * 用法：node scripts/history.mjs [--top 100]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
const KEEP_DAYS = 366

const argv = process.argv.slice(2)
const topIndex = argv.indexOf('--top')
const TOP = topIndex >= 0 ? Number(argv[topIndex + 1]) || 100 : 100

export async function runHistory(outDir = DATA_DIR) {
  const registry = JSON.parse(await readFile(join(outDir, 'registry.json'), 'utf8'))
  const rankings = JSON.parse(await readFile(join(outDir, 'rankings.json'), 'utf8'))

  let history = { meta: { updatedAt: null }, days: [] }
  try {
    history = JSON.parse(await readFile(HISTORY_FILE, 'utf8'))
    if (!Array.isArray(history.days)) history = { meta: { updatedAt: null }, days: [] }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`history.json 读取失败，重建：${err.message}`)
  }

  const date = new Date().toISOString().slice(0, 10) // UTC 日
  const top = (rankings.rankings ?? []).slice(0, TOP).map((r) => ({
    fullName: r.fullName,
    rank: r.rank,
    score: r.score,
    stars: r.stars,
    category: r.category ?? null,
  }))
  const snapshot = {
    date,
    total: registry.meta?.counts?.topicRepos ?? registry.plugins?.length ?? 0,
    ranked: registry.meta?.counts?.ranked ?? rankings.rankings?.length ?? 0,
    excluded: registry.meta?.counts?.excluded ?? 0,
    top,
  }

  const idx = history.days.findIndex((d) => d.date === date)
  if (idx >= 0) history.days[idx] = snapshot
  else history.days.push(snapshot)

  // 按日期升序 + 保留最近 KEEP_DAYS
  history.days.sort((a, b) => a.date.localeCompare(b.date))
  if (history.days.length > KEEP_DAYS) history.days = history.days.slice(-KEEP_DAYS)
  history.meta = { updatedAt: new Date().toISOString() }

  await mkdir(outDir, { recursive: true })
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
  return { date, days: history.days.length, top: top.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await runHistory()
  console.log(`已写入 ${HISTORY_FILE}：快照 ${r.date}（top ${r.top}），共 ${r.days} 天历史`)
}
