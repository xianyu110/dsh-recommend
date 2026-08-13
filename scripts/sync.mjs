/**
 * sync.mjs — 数据管道总入口
 *
 * fetch → score → validate，一次跑完，输出汇总。CI 每日 cron 调用的就是它：
 *   node scripts/sync.mjs [--limit N] [--no-awesome]
 *
 * --limit N      只抓取 GitHub Search 前 N 页（本地快速调试用）
 * --no-awesome   跳过 awesome 列表抓取（离线调试）
 *
 * 退出码：管道任意一步失败即非零（GitHub Actions 红）。
 */
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)))

async function step(name, args) {
  const started = Date.now()
  try {
    const { stdout, stderr } = await run(process.execPath, [join(SCRIPTS, name), ...args], {
      encoding: 'utf8',
    })
    console.log(`[ok] ${name} (${Date.now() - started}ms)`)
    for (const line of stdout.trim().split('\n')) console.log(`     ${line}`)
    if (stderr.trim()) for (const line of stderr.trim().split('\n')) console.log(`     [warn] ${line}`)
  } catch (err) {
    console.error(`[fail] ${name}`)
    console.error(err.stdout ?? '')
    console.error(err.stderr ?? err.message)
    process.exit(1)
  }
}

await step('fetch.mjs', process.argv.slice(2))
await step('score.mjs', [])
await step('validate.mjs', [])

console.log('✓ 数据管道完成')
