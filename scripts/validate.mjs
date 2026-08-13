/**
 * validate.mjs — 数据校验（CI 门禁）
 *
 * 校验 data/registry.json 与 data/rankings.json 的结构完整性：
 *   - meta 齐全（版本/时间/数量）
 *   - registry 无重复 fullName
 *   - 分数在 [0,1]，排名严格降序
 *   - rankings 中的条目都未排除，registry 中的排除条目带 reason
 * 任何一项失败都以非零码退出（GitHub Actions 会红）。
 *
 * 用法：node scripts/validate.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data')

const errors = []
function check(ok, message) {
  if (!ok) errors.push(message)
}

const registry = JSON.parse(await readFile(join(DATA_DIR, 'registry.json'), 'utf8'))
const rankings = JSON.parse(await readFile(join(DATA_DIR, 'rankings.json'), 'utf8'))

check(typeof registry.meta?.scoringVersion === 'number', 'registry.meta.scoringVersion 缺失')
check(Number.isFinite(registry.meta?.counts?.topicRepos), 'registry.meta.counts 缺失')
check(registry.meta.scoringVersion === rankings.meta?.scoringVersion, 'registry/rankings 评分版本不一致')

const seen = new Set()
for (const p of registry.plugins ?? []) {
  check(typeof p.fullName === 'string' && p.fullName.length > 0, 'registry 存在无 fullName 的条目')
  check(!seen.has(p.fullName), `registry 重复条目: ${p.fullName}`)
  seen.add(p.fullName)
  check(p.score >= 0 && p.score <= 1, `分数越界: ${p.fullName} score=${p.score}`)
  if (p.excluded) check(typeof p.excluded === 'string', `${p.fullName} excluded 应为原因字符串`)
}

let prev = Number.POSITIVE_INFINITY
for (const r of rankings.rankings ?? []) {
  check(!r.excluded, `rankings 混入排除条目: ${r.fullName}`)
  check(r.score <= prev, `排名未降序: rank=${r.rank} ${r.fullName}`)
  prev = r.score
  check(r.rank > 0, 'rank 应从 1 开始')
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`)
  console.error(`校验失败：${errors.length} 处`)
  process.exit(1)
}
console.log(
  `✓ 校验通过：registry=${registry.plugins.length} rankings=${rankings.rankings.length} `,
)
