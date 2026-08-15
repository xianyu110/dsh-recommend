/**
 * report.mjs — 月度生态报告（数据即内容）
 *
 * 对比 history.json 中最近两个不同日期的快照（或最新快照 vs 当前 registry），
 * 输出 markdown：总量统计 / Top10 变动 / 新秀榜（新进 top100）/ 涨幅榜 / 失活榜。
 *
 * 用法：
 *   node scripts/report.mjs --stdout          # 打印到终端
 *   node scripts/report.mjs --out docs/reports  # 写入 docs/reports/<YYYY-MM>.md
 *
 * 历史不足两天时输出降级（只有总量与当前 Top10）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const TOP_N = 100

/** 取历史里最近的两个不同日期快照（升序数组中最后两个）。 */
export function lastTwoSnapshots(history) {
  const days = [...(history.days ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  return days.length >= 2 ? [days[days.length - 2], days[days.length - 1]] : [days[days.length - 1]]
}

export async function buildReport(outDir = DATA_DIR) {
  let history = { days: [] }
  try {
    history = JSON.parse(await readFile(join(outDir, 'history.json'), 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`history.json 读取失败：${err.message}`)
  }
  const registry = JSON.parse(await readFile(join(outDir, 'registry.json'), 'utf8'))

  const snapshots = lastTwoSnapshots(history)
  const prev = snapshots.length >= 2 ? snapshots[0] : null
  const cur = snapshots[snapshots.length - 1] ?? null
  const curRank = new Map((cur?.top ?? []).map((t) => [t.fullName.toLowerCase(), t]))
  const prevRank = new Map((prev?.top ?? []).map((t) => [t.fullName.toLowerCase(), t]))

  const month = (new Date().toISOString().slice(0, 7))
  const L = []
  L.push(`# DSH 插件生态月报 · ${month}`)
  L.push('')
  L.push(`> 数据：dsh-recommend（${cur?.date ?? '—'}）· 评分模型 v${registry.meta?.scoringVersion} · 公式公开可复算`)
  L.push('')

  const counts = registry.meta?.counts ?? {}
  L.push(`## 生态总量`)
  L.push('')
  L.push(`| 指标 | 数值 |`)
  L.push(`|---|---|`)
  L.push(`| 收录仓库 | ${counts.topicRepos ?? '—'} |`)
  L.push(`| 上榜（排除后） | ${counts.ranked ?? '—'} |`)
  L.push(`| 排除 | ${counts.excluded ?? '—'} |`)
  L.push(`| 分类覆盖 | ${registry.meta?.signals?.hubCatalog?.entries ?? 0} 条 / ${registry.meta?.signals?.hubCatalog?.categories ?? 0} 类 |`)
  L.push(`| 精选（curated） | ${registry.plugins?.filter((p) => p.curated).length ?? '—'} |`)
  L.push(`| 深扫验证 | ${JSON.stringify(registry.meta?.signals?.scanCounts ?? {})} |`)
  L.push('')

  if (prev && cur) {
    const topDiff = []
    for (const t of cur.top ?? []) {
      const k = t.fullName.toLowerCase()
      const before = prevRank.get(k)?.rank
      if (before === undefined) topDiff.push(`  - **${t.fullName}** 新进 Top${TOP_N}（第 ${t.rank} 名）`)
      else if (before !== t.rank) topDiff.push(`  - **${t.fullName}** ${before} → ${t.rank}（${before > t.rank ? '↑' : '↓'}${Math.abs(before - t.rank)}）`)
    }
    if (topDiff.length) {
      L.push(`## Top${TOP_N} 变动（${prev.date} → ${cur.date}）`)
      L.push('')
      L.push(...topDiff)
      L.push('')
    }

    // 新秀榜：当前 top100 中之前不在榜的
    const newbies = cur.top.filter((t) => !prevRank.has(t.fullName.toLowerCase()))
    if (newbies.length) {
      L.push(`## 🆕 新秀榜（新进 Top${TOP_N}）`)
      L.push('')
      L.push(`| 排名 | 插件 | 分数 | ★ | 分类 |`)
      L.push(`|---|---|---|---|---|`)
      for (const t of newbies) L.push(`| ${t.rank} | ${t.fullName} | ${t.score.toFixed(3)} | ${t.stars} | ${t.category ?? '—'} |`)
      L.push('')
    }

    // 涨幅榜：按 score 增幅
    const gainers = cur.top
      .map((t) => ({ t, before: prevRank.get(t.fullName.toLowerCase()) }))
      .filter((x) => x.before)
      .map((x) => ({ ...x, delta: x.t.score - x.before.score }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10)
      .filter((x) => x.delta > 0)
    if (gainers.length) {
      L.push(`## 📈 涨幅榜（score 提升 Top10）`)
      L.push('')
      L.push(`| 插件 | 分数变化 | 现排名 |`)
      L.push(`|---|---|---|`)
      for (const g of gainers) L.push(`| ${g.t.fullName} | ${g.before.score.toFixed(3)} → ${g.t.score.toFixed(3)}（+${g.delta.toFixed(3)}） | ${g.t.rank} |`)
      L.push('')
    }

    // 失活榜：当前 top100 中 stars 增幅为 0 且排名下滑最多的
    const decliners = cur.top
      .map((t) => ({ t, before: prevRank.get(t.fullName.toLowerCase()) }))
      .filter((x) => x.before && x.before.rank < x.t.rank)
      .sort((a, b) => (b.t.rank - b.before.rank) - (a.t.rank - a.before.rank))
      .slice(0, 10)
    if (decliners.length) {
      L.push(`## 📉 排名下滑榜（Top10）`)
      L.push('')
      L.push(`| 插件 | 排名变化 |`)
      L.push(`|---|---|`)
      for (const d of decliners) L.push(`| ${d.t.fullName} | ${d.before.rank} → ${d.t.rank}（-${d.t.rank - d.before.rank}） |`)
      L.push('')
    }
  } else {
    L.push(`> 历史不足两天，趋势对比暂缺（下一轮同步后自动出现）。`)
    L.push('')
  }

  L.push(`## 当前 Top10`)
  L.push('')
  L.push(`| 排名 | 插件 | 分数 | ★ | 分类 |`)
  L.push(`|---|---|---|---|---|`)
  for (const t of (cur?.top ?? []).slice(0, 10)) {
    L.push(`| ${t.rank} | ${t.fullName} | ${t.score.toFixed(3)} | ${t.stars} | ${t.category ?? '—'} |`)
  }
  L.push('')
  L.push(`---`)
  L.push(`由 [dsh-recommend](https://github.com/zp-home/dsh-recommend) 自动生成 · 收录 ≠ 安全背书`)

  return { month, md: L.join('\n') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { month, md } = await buildReport()
  const outIndex = process.argv.indexOf('--out')
  if (outIndex >= 0 && process.argv[outIndex + 1]) {
    const dir = join(ROOT, process.argv[outIndex + 1])
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${month}.md`)
    await writeFile(file, md, 'utf8')
    console.log(`已写入 ${file}`)
  } else {
    console.log(md)
  }
}
