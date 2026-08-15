/**
 * curate.mjs — 精选认证收录：从 approved issue 提取仓库地址，追加到 curated.json。
 *
 * 由 .github/workflows/curate.yml 调用（监听 issue 被标 approved 标签）：
 *   node scripts/curate.mjs --repo owner/name --issue 123 [--npm dsh-xxx]
 *
 * 零依赖（Node 18+ 内置 API）。校验规则与 AGENTS.md 一致：
 *   - 只接受合法 owner/name 格式，拒绝路径穿越与任意字符串
 *   - 已收录的不重复追加
 *   - 输出写回 scripts/curated.json（保持 JSON 结构，供 score.mjs 消费）
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CURATED_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'curated.json')

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const NPM_PATTERN = /^@?[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/

/**
 * 追加一个通过审核的仓库到精选列表。
 * @param fullName - 'owner/name' 格式。
 * @param issueNumber - 通过审核的 issue 编号。
 * @param npmPackage - 可选：npm 包名（用于下载量榜）。
 * @returns 新增的条目（已存在时返回 null）。
 */
export async function addCurated(fullName, issueNumber, npmPackage = null) {
  const name = fullName.trim()
  if (!REPO_PATTERN.test(name)) {
    throw new Error(`非法仓库名（应为 owner/name）：${fullName}`)
  }
  const pkg = (npmPackage ?? '').trim() || null
  if (pkg && !NPM_PATTERN.test(pkg)) {
    throw new Error(`非法 npm 包名：${npmPackage}`)
  }
  let list
  try {
    list = JSON.parse(await readFile(CURATED_FILE, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    list = { plugins: [] }
  }
  const plugins = Array.isArray(list.plugins) ? list.plugins : []
  if (plugins.some((p) => p.fullName === name)) return null
  const entry = {
    fullName: name,
    issue: Number(issueNumber) || null,
    approvedAt: new Date().toISOString().slice(0, 10),
    ...(pkg ? { npmPackage: pkg } : {}),
  }
  plugins.push(entry)
  await writeFile(CURATED_FILE, JSON.stringify({ note: list.note, plugins }, null, 2) + '\n', 'utf8')
  return entry
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const repoIndex = argv.indexOf('--repo')
  const issueIndex = argv.indexOf('--issue')
  const npmIndex = argv.indexOf('--npm')
  const repo = repoIndex >= 0 ? argv[repoIndex + 1] : ''
  const issue = issueIndex >= 0 ? argv[issueIndex + 1] : ''
  const npm = npmIndex >= 0 ? argv[npmIndex + 1] : null
  if (!repo) {
    console.error('用法：node scripts/curate.mjs --repo owner/name --issue 123 [--npm dsh-xxx]')
    process.exit(2)
  }
  const entry = await addCurated(repo, issue, npm)
  console.log(entry ? `已收录精选：${entry.fullName}（issue #${entry.issue ?? '?'}）` : `已存在，跳过：${repo}`)
}
