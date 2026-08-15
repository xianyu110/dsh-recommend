/**
 * validate.mjs — 数据校验（CI 门禁）
 *
 * 校验 data/registry.json 与 data/rankings.json 的结构完整性 + 信号源健康度：
 *   - meta 齐全（版本/时间/数量）
 *   - registry 无重复 fullName
 *   - 分数在 [0,1]，排名严格降序
 *   - rankings 中的条目都未排除，registry 中的排除条目带 reason
 *   - hub 目录信号非空（fetch 静默降级会在这里红）
 *   - awesome 精选信号有命中
 *   - 深扫一致性：unverified 条目必须被排除，rankings 不得混入
 * 任何一项失败都以非零码退出（GitHub Actions 会红）。
 *
 * 用法：node scripts/validate.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data')

const errors = []
const infos = []
function check(ok, message) {
  if (!ok) errors.push(message)
}

const registry = JSON.parse(await readFile(join(DATA_DIR, 'registry.json'), 'utf8'))
const rankings = JSON.parse(await readFile(join(DATA_DIR, 'rankings.json'), 'utf8'))

check(typeof registry.meta?.scoringVersion === 'number', 'registry.meta.scoringVersion 缺失')
check(Number.isFinite(registry.meta?.counts?.topicRepos), 'registry.meta.counts 缺失')
check(registry.meta.scoringVersion === rankings.meta?.scoringVersion, 'registry/rankings 评分版本不一致')

// 信号源健康度：hub 目录（分类 + curated 信号的来源）不能静默为空
const hub = registry.meta?.signals?.hubCatalog
check(hub && typeof hub === 'object', 'meta.signals.hubCatalog 缺失（fetch 未记录目录状态）')
if (hub) {
  check(hub.fetchedAt, 'hub 目录未抓取成功（fetchedAt 缺失，fetch 已降级）')
  check(hub.entries >= 10, `hub 目录条目过少（${hub.entries}，正常应有 200+），分类/精选信号失效`)
  check(!hub.error, `hub 目录抓取失败：${hub.error}`)
}
// awesome 精选信号不能为空
const awesomeHits = registry.meta?.signals?.awesome?.hitRepos
check(Number.isFinite(awesomeHits) && awesomeHits > 0, `awesome 精选信号 0 命中（${awesomeHits}），请检查 fetch`)

const seen = new Set()
let categoryCovered = 0
let curatedCount = 0
for (const p of registry.plugins ?? []) {
  check(typeof p.fullName === 'string' && p.fullName.length > 0, 'registry 存在无 fullName 的条目')
  check(!seen.has(p.fullName), `registry 重复条目: ${p.fullName}`)
  seen.add(p.fullName)
  check(p.score >= 0 && p.score <= 1, `分数越界: ${p.fullName} score=${p.score}`)
  if (p.excluded) check(typeof p.excluded === 'string', `${p.fullName} excluded 应为原因字符串`)
  if (p.category) categoryCovered += 1
  if (p.curated) curatedCount += 1
  // 深扫一致性：unverified 必须被排除
  if (p.scanStatus === 'unverified' && !p.excluded) {
    check(false, `深扫未检出插件特征但未排除: ${p.fullName}`)
  }
}

let prev = Number.POSITIVE_INFINITY
for (const r of rankings.rankings ?? []) {
  check(!r.excluded, `rankings 混入排除条目: ${r.fullName}`)
  check(r.score <= prev, `排名未降序: rank=${r.rank} ${r.fullName}`)
  prev = r.score
  check(r.rank > 0, 'rank 应从 1 开始')
  check(r.scanStatus !== 'unverified', `rankings 混入深扫未检出条目: ${r.fullName}`)
}

infos.push(`分类覆盖 ${categoryCovered}/${registry.plugins?.length ?? 0} · curated ${curatedCount}`)
infos.push(`深扫状态：${JSON.stringify(registry.meta?.signals?.scanCounts ?? '（未记录）')}`)

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`)
  console.error(`校验失败：${errors.length} 处`)
  process.exit(1)
}
for (const i of infos) console.log(`ℹ ${i}`)
console.log(
  `✓ 校验通过：registry=${registry.plugins.length} rankings=${rankings.rankings.length} ` +
    `hub=${hub?.entries}/${hub?.categories} curated=${curatedCount}`,
)
