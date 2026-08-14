/**
 * fetch.mjs — 数据采集
 *
 * 从公开数据源抓取 DSH 插件生态的原始数据，写入 data/raw/：
 *   1. GitHub Search API：topic:dsh-plugin 的全部公开仓库（含元数据：stars/forks/
 *      pushed_at/license/size/描述等，一次请求内返回，无需逐仓再查）。
 *      注意：Search API 单个查询最多返回 1000 条（10 页 × 100），第 11 页起恒为空，
 *      且 repository 搜索不支持按 created 排序；全量通过 created 日期区间分桶 +
 *      递归拆分实现（见 fetchTopicRepos）。
 *   2. dsh-external/hub 精选目录的公开镜像（0xsline/awesome-deepseek-harness 的
 *      CATALOG.md）：官方精选目录（分类映射 + 精选信号）。
 *   3. 三个 awesome 精选列表：人工精选信号（被收录 = 生态信号加分）。
 *
 * 全部使用 Node 18+ 内置 fetch，零依赖。未认证时 GitHub Search API 限额
 * 10 次/分钟；话题仓库数 >1000 后全量请求数会到百级，**必须设置 GITHUB_TOKEN**
 * （30 次/分钟）才能完整跑完，CI 已注入 github.token。
 *
 * 用法：node scripts/fetch.mjs [--out data/raw]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DIR = join(ROOT, 'data', 'raw')

const GITHUB_API = 'https://api.github.com'
const token = process.env.GITHUB_TOKEN ?? ''
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-recommend',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}

/** GitHub Search API 硬上限：单个查询最多返回 1000 条（10 页 × 100）。 */
const SEARCH_RESULTS_CAP = 1000
const SEARCH_PER_PAGE = 100
/** 单个查询最多可翻的页数（超过也是空数组，不用再试）。 */
const SEARCH_PAGES_PER_QUERY = SEARCH_RESULTS_CAP / SEARCH_PER_PAGE
/** 一次运行的总页数安全阀（按年分桶后请求数随仓库数增长），防失控请求。
 *  注意：话题仓库数超过 1000 且存在单日密集簇时，拆分树会吃掉大量页数
 *  （单日簇的定位过程会重复翻页），全量请配 GITHUB_TOKEN（未认证 10 次/分
 *  撑不住百级请求，会 403 限流）。 */
const MAX_PAGES_DEFAULT = 200
/** created 分桶下界：dsh-plugin 话题不可能早于 2008。 */
const CREATED_FLOOR = '2008-01-01'

/** 'YYYY-MM-DD' 的 UTC 毫秒值。 */
function dayMs(dateStr) {
  return Date.parse(`${dateStr}T00:00:00Z`)
}

/** 'YYYY-MM-DD' ± n 天（UTC，与 GitHub 的 created_at 时区一致）。 */
function addDays(dateStr, days) {
  const d = new Date(dayMs(dateStr))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function gh(url, retries = 3) {
  const res = await fetch(url, { headers })
  if (res.status === 403 || res.status === 429) {
    if (retries <= 0) throw new Error(`GitHub API ${res.status} ${res.statusText}（重试耗尽）: ${url}`)
    const retryAfter = Number(res.headers.get('retry-after')) || 10
    console.warn(`GitHub API ${res.status}：${retryAfter}s 后重试（剩余 ${retries} 次）: ${url}`)
    await new Promise((r) => setTimeout(r, retryAfter * 1000))
    return gh(url, retries - 1)
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${url}`)
  }
  return res.json()
}

async function text(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'dsh-recommend' } })
  if (!res.ok) throw new Error(`GET ${res.status}: ${url}`)
  return res.text()
}

/**
 * 抓取 topic:dsh-plugin 全量公开仓库。
 *
 * Search API 单个查询最多返回 1000 条（10 页 × 100），第 11 页恒为空数组；且
 * repository 搜索不支持按 created 排序（sort=created 会被静默忽略、按相关度返回），
 * 所以「全量」不能用游标推进，只能按 created 日期区间分桶 + 递归拆分：
 *   1. 按 `created:lo..hi` 区间分桶查询（区间含两端，日期粒度精确到天，桶间无重叠、
 *      不依赖任何排序），桶内 ≤1000 条时翻 10 页即可全部取完（顺序无关）；
 *   2. 某桶取满 1000 条（10 页）说明桶内可能更多，从中间日期拆成两个子桶重抓，
 *      直到子桶不足 1000 条，或拆到单日（单日 ≥1000 条是 Search API 无法绕过的
 *      极限——created 只精确到天，此时告警截断）；
 *   3. 桶间无重叠，重复仅为翻页漂移，仍按 full_name 去重兜底。
 *
 * maxPages 是本次运行的总页数预算（--limit N 冒烟测试传小值）；默认给足一轮全量，
 * 预算耗尽且最后处理的桶仍是满的（或桶内抓取被打断）时打警告。
 */
export async function fetchTopicRepos(maxPages = MAX_PAGES_DEFAULT) {
  const repos = []
  const seen = new Set()
  let pagesUsed = 0
  let truncatedByBudget = false // 桶内翻页时预算耗尽（有仓库没取完）
  let lastBucketFull = false // 最后一个桶取满了 10 页（可能还有仓库没取完）

  /** 抓取一个 created:[lo,hi] 区间桶；返回该桶是否「满」（可能更大需要拆）。 */
  async function fetchBucket(lo, hi) {
    let rawItems = 0
    let bucketTotal = Infinity
    for (let page = 1; page <= SEARCH_PAGES_PER_QUERY; page += 1) {
      if (pagesUsed >= maxPages) {
        truncatedByBudget = true
        break
      }
      const url = `${GITHUB_API}/search/repositories?q=topic%3Adsh-plugin%20created%3A${lo}..${hi}&per_page=${SEARCH_PER_PAGE}&page=${page}`
      const body = await gh(url)
      const items = body.items ?? []
      bucketTotal = body.total_count ?? bucketTotal
      rawItems += items.length
      for (const item of items) {
        // 翻页期间结果集可能变化导致同一仓库重复出现：按 full_name 去重，保留首个
        if (seen.has(item.full_name)) continue
        seen.add(item.full_name)
        repos.push(item)
      }
      pagesUsed += 1
      if (items.length === 0 || rawItems >= bucketTotal) break
      // 未认证 Search 限额 10/min（页间间隔 6.5s）；带 token 30/min（2s 足够）
      await new Promise((r) => setTimeout(r, token ? 2000 : 6500))
    }
    return rawItems >= SEARCH_RESULTS_CAP && rawItems < bucketTotal
  }

  // 分桶：从最近一年往早排（--limit 冒烟时先抓最新的仓库）
  const today = new Date().toISOString().slice(0, 10)
  const thisYear = Number(today.slice(0, 4))
  const ranges = [[`${thisYear}-01-01`, today]]
  for (let y = thisYear - 1; y >= Number(CREATED_FLOOR.slice(0, 4)); y -= 1) {
    ranges.push([`${y}-01-01`, `${y}-12-31`])
  }

  while (ranges.length > 0 && pagesUsed < maxPages) {
    const [lo, hi] = ranges.shift()
    lastBucketFull = await fetchBucket(lo, hi)
    if (!lastBucketFull) continue
    if (lo === hi) {
      // 拆到单日仍满：created 只精确到天，超出部分 API 永远拿不到
      console.warn(
        `日期 ${lo} 单日仓库数 ≥ ${SEARCH_RESULTS_CAP} 条，超出部分是 Search API ` +
          '无法返回的（created 只精确到天），本次结果不完整',
      )
      continue
    }
    // 桶可能更大：从中间日期拆成 [lo,mid] + [mid+1,hi]（无重叠、必前进）
    const mid = addDays(lo, Math.floor((dayMs(hi) - dayMs(lo)) / 86400000 / 2))
    const next = addDays(mid, 1)
    ranges.unshift([lo, mid])
    if (next <= hi) ranges.unshift([next, hi])
  }

  if (pagesUsed >= maxPages && (lastBucketFull || truncatedByBudget)) {
    console.warn(
      `页预算 ${maxPages} 页已耗尽但仍有仓库未取完（话题仓库数可能超过 ` +
        `${maxPages * SEARCH_PER_PAGE} 条）：请调大 MAX_PAGES_DEFAULT 或设置 GITHUB_TOKEN 提速`,
    )
  }
  return repos
}

/**
 * 解析 dsh-external/hub 精选目录的公开镜像（0xsline/awesome-deepseek-harness 的
 * CATALOG.md，由 GitHub Actions 每日从 hub 的 catalog.json 自动生成）：
 * `## <emoji> <分类名>（N）` 小节 + `| [name](url) | 描述 |` 表格行。
 * 注意：hub 组织仓库本身是私有的（需 org 权限），不要直接抓 dsh-external/hub。
 * 「公开插件 Topic」小节是话题原始转储而非人工精选，不计入 curated 信号。
 * 返回 [{ name, url, category, description }]，并附带分类名集合。
 */
export async function fetchHubCatalog() {
  const url = 'https://raw.githubusercontent.com/0xsline/awesome-deepseek-harness/main/CATALOG.md'
  let md
  try {
    md = await text(url)
  } catch {
    console.warn('hub 目录镜像抓取失败，跳过（生态信号将只来自 awesome 列表）')
    return { entries: [], categories: [] }
  }
  const entries = []
  const categories = []
  let category = '未分类'
  for (const line of md.split('\n')) {
    const head = /^## (.+?)（(\d+)）$/.exec(line.trim())
    if (head) {
      category = head[1]
      categories.push(category)
      continue
    }
    // 话题原始转储不算人工精选
    if (/Topic|公开插件/.test(category)) continue
    const row = /^\| \[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\) \| (.*) \|$/.exec(line.trim())
    if (row) {
      entries.push({ name: row[1], url: row[2], category, description: row[3] })
    }
  }
  return { entries, categories }
}

/** 抓取三个 awesome 精选列表，提取其中出现的 GitHub 仓库（owner/repo）。 */
export async function fetchAwesomeLists() {
  const urls = [
    'https://raw.githubusercontent.com/0xsline/awesome-deepseek-harness/main/README.md',
    'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md',
    'https://raw.githubusercontent.com/Alex-Yanggg/awesome-DSH-plugin/main/README.md',
  ]
  const mentioned = new Map() // 'owner/repo' -> Set<listName>
  for (const url of urls) {
    const listName = new URL(url).pathname.split('/')[1]
    try {
      const md = await text(url)
      for (const m of md.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
        const full = m[1].replace(/[)#]/g, '')
        if (!mentioned.has(full)) mentioned.set(full, new Set())
        mentioned.get(full).add(listName)
      }
    } catch (err) {
      console.warn(`awesome 列表 ${listName} 抓取失败：${err.message}`)
    }
  }
  return Object.fromEntries([...mentioned].map(([k, v]) => [k, [...v]]))
}

/** 归一化 GitHub API 仓库对象为精简的注册表输入行。 */
export function toRepoRecord(repo) {
  return {
    name: repo.name,
    owner: repo.owner?.login ?? '',
    fullName: repo.full_name,
    url: repo.html_url,
    description: (repo.description ?? '').trim(),
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    sizeKb: repo.size ?? 0,
    language: repo.language ?? null,
    license: repo.license?.spdx_id ?? null,
    archived: repo.archived ?? false,
    fork: repo.fork ?? false,
    createdAt: repo.created_at ?? null,
    pushedAt: repo.pushed_at ?? null,
    updatedAt: repo.updated_at ?? null,
    homepage: repo.homepage ?? null,
    topics: repo.topics ?? [],
  }
}

const argv = process.argv.slice(2)
const out = argv.includes('--dry') ? null : RAW_DIR
const limitIndex = argv.indexOf('--limit')
const maxPages = limitIndex >= 0 ? Number(argv[limitIndex + 1]) || MAX_PAGES_DEFAULT : MAX_PAGES_DEFAULT

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repos = await fetchTopicRepos(maxPages)
  const catalog = await fetchHubCatalog()
  const awesome = await fetchAwesomeLists()
  const payload = {
    fetchedAt: new Date().toISOString(),
    topicRepos: repos.map(toRepoRecord),
    hubCatalog: catalog,
    awesomeLists: awesome,
  }
  if (out) {
    await mkdir(out, { recursive: true })
    await writeFile(join(out, 'repos.json'), JSON.stringify(payload, null, 2))
    console.log(`已写入 ${join(out, 'repos.json')}（topic 仓库 ${repos.length} 个）`)
  } else {
    console.log(JSON.stringify(payload, null, 2))
  }
}
