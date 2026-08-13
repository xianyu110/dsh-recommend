/**
 * score.mjs — 过滤 + 评分
 *
 * 把 data/raw/repos.json 加工为：
 *   data/registry.json   全量仓库 + 每个信号 + 分数 + 排除原因
 *   data/rankings.json   可上榜仓库按分数降序（含分数构成）
 *   data/meta.json       生成时间/数量/评分版本/公式（与 docs/scoring.md 保持一致）
 *
 * 评分模型 v1（权威定义见 docs/scoring.md，改权重必须先改文档）：
 *   maintenance = exp(-daysSincePush / 180)                  # 维护性：半衰期 180 天
 *   popularity  = min(1, log10(stars + 1) / 3)               # 热度：1000 stars 封顶
 *   quality     = 0.4*hasLicense + 0.3*richDescription + 0.3*hasContent
 *   ecosystem   = curated ? 1.0 : 0.2                        # 精选收录信号
 *   score       = 0.35*maintenance + 0.30*popularity
 *               + 0.20*quality + 0.15*ecosystem
 *
 * 排除规则（进 registry，不进 rankings，附 reason）：
 *   - fork 或 archived
 *   - 占位/空仓库：sizeKb == 0 或描述命中占位特征
 *   - 描述为空
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SCORING_VERSION = 1

const WEIGHTS = { maintenance: 0.35, popularity: 0.3, quality: 0.2, ecosystem: 0.15 }

const PLACEHOLDER_HINTS = /占位|待填充|placeholder|description pending|empty repo|wip|coming soon|预留/i

function daysSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x))
}

/** 计算单个仓库的信号与分数。ecosystem 为 0..1。 */
export function scoreRepo(repo, ecosystem) {
  const daysSincePush = daysSince(repo.pushedAt)
  const signals = {
    maintenance: clamp01(Math.exp(-daysSincePush / 180)),
    popularity: clamp01(Math.log10(repo.stars + 1) / 3),
    quality: clamp01(
      0.4 * (repo.license ? 1 : 0)
      + 0.3 * (repo.description.length >= 40 ? 1 : 0)
      + 0.3 * ((repo.sizeKb ?? 0) > 0 ? 1 : 0),
    ),
    ecosystem: clamp01(ecosystem),
  }
  const score = Object.entries(WEIGHTS)
    .reduce((sum, [key, w]) => sum + w * signals[key], 0)
  return { signals, score, daysSincePush }
}

/** 判定一个仓库是否应排除出榜单。返回 null 或排除原因。 */
export function exclusionReason(repo) {
  if (repo.fork) return 'fork 仓库'
  if (repo.archived) return '已归档'
  if ((repo.sizeKb ?? 0) === 0) return '空仓库（sizeKb=0）'
  if (!repo.description) return '无描述'
  if (PLACEHOLDER_HINTS.test(repo.description)) return '占位/WIP 特征'
  return null
}

/** 主入口：读取 raw，写出 registry/rankings/meta。 */
export async function runScore(rawDir = join(ROOT(), 'data', 'raw'), outDir = join(ROOT(), 'data')) {
  const raw = JSON.parse(await readFile(join(rawDir, 'repos.json'), 'utf8'))

  // 构建精选集合。注意：hub 目录的 URL 大多是 dsh-external/<name> 镜像地址，
  // 而真实仓库在作者命名空间下（dsh-external/<name> 重定向到 <author>/<name>），
  // 因此 curated 判定按「仓库名（不区分大小写）」匹配，URL 匹配作补充。
  const hubNames = new Set((raw.hubCatalog?.entries ?? []).map((e) => e.name.toLowerCase()))
  const hubUrls = new Set((raw.hubCatalog?.entries ?? []).map((e) => e.url.toLowerCase()))
  const hubCategories = new Map()
  for (const e of raw.hubCatalog?.entries ?? []) {
    hubCategories.set(e.name.toLowerCase(), e.category)
  }
  const awesomeRepos = raw.awesomeLists ?? {}

  const registry = []
  let excluded = 0
  for (const repo of raw.topicRepos ?? []) {
    const nameKey = repo.name.toLowerCase()
    const urlKey = repo.url.toLowerCase()
    const curated = hubNames.has(nameKey) || hubUrls.has(urlKey)
    const awesomeListNames = awesomeRepos[repo.fullName.toLowerCase()] ?? []
    const ecosystem = curated || awesomeListNames.length > 0 ? 1.0 : 0.2
    const { signals, score, daysSincePush } = scoreRepo(repo, ecosystem)
    const reason = exclusionReason(repo)
    if (reason) excluded += 1
    registry.push({
      ...repo,
      category: hubCategories.get(nameKey) ?? null,
      curated,
      awesomeLists: awesomeListNames,
      daysSincePush: Math.round(daysSincePush),
      signals,
      score: Math.round(score * 10000) / 10000,
      excluded: reason,
    })
  }

  const ranked = registry
    .filter((r) => !r.excluded)
    .sort((a, b) => b.score - a.score || b.stars - a.stars)
    .map((r, i) => ({ rank: i + 1, ...r }))

  const meta = {
    scoringVersion: SCORING_VERSION,
    weights: WEIGHTS,
    generatedAt: new Date().toISOString(),
    rawFetchedAt: raw.fetchedAt ?? null,
    counts: {
      topicRepos: registry.length,
      excluded,
      ranked: ranked.length,
    },
    formula: {
      maintenance: 'exp(-daysSincePush / 180)',
      popularity: 'min(1, log10(stars + 1) / 3)',
      quality: '0.4*hasLicense + 0.3*richDescription(>=40 chars) + 0.3*hasContent(sizeKb>0)',
      ecosystem: 'curated(1.0) | awesome-listed(1.0) | else 0.2',
      score: '0.35*maintenance + 0.30*popularity + 0.20*quality + 0.15*ecosystem',
    },
  }

  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'registry.json'), JSON.stringify({ meta, plugins: registry }, null, 2))
  await writeFile(join(outDir, 'rankings.json'), JSON.stringify({ meta, rankings: ranked }, null, 2))
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2))
  return meta
}

function ROOT() {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const meta = await runScore()
  console.log(
    `registry=${meta.counts.topicRepos} 排除=${meta.counts.excluded} 上榜=${meta.counts.ranked} `,
  )
}
