/**
 * fetch.mjs — 数据采集
 *
 * 从公开数据源抓取 DSH 插件生态的原始数据，写入 data/raw/：
 *   1. GitHub Search API：topic:dsh-plugin 的全部公开仓库（含元数据：stars/forks/
 *      pushed_at/license/size/描述等，一次请求内返回，无需逐仓再查）。
 *   2. dsh-external/hub 精选目录的公开镜像（0xsline/awesome-deepseek-harness 的
 *      CATALOG.md）：官方精选目录（分类映射 + 精选信号）。
 *   3. 三个 awesome 精选列表：人工精选信号（被收录 = 生态信号加分）。
 *
 * 全部使用 Node 18+ 内置 fetch，零依赖。未认证时 GitHub Search API 限额
 * 10 次/分钟（够跑一轮）；CI 里设置 GITHUB_TOKEN 可提到 30 次/分钟。
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

/** 抓取 topic:dsh-plugin 全量公开仓库（Search API 每页 100，最多 10 页）。 */
export async function fetchTopicRepos(maxPages = 10) {
  const repos = []
  const seen = new Set()
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${GITHUB_API}/search/repositories?q=topic%3Adsh-plugin&per_page=100&page=${page}`
    const body = await gh(url)
    for (const item of body.items) {
      // 翻页期间结果集可能变化导致同一仓库重复出现：按 full_name 去重，保留首个
      if (seen.has(item.full_name)) continue
      seen.add(item.full_name)
      repos.push(item)
    }
    if (repos.length >= body.total_count || body.items.length === 0) break
    // 未认证 Search 限额 10/min（页间间隔 6.5s）；带 token 30/min（2s 足够）
    await new Promise((r) => setTimeout(r, token ? 2000 : 6500))
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
const maxPages = limitIndex >= 0 ? Number(argv[limitIndex + 1]) || 10 : 10

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
