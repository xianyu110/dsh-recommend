/**
 * smoke.mjs — 数据管道零依赖冒烟测试（CI 用）
 *
 * 对纯函数做固定断言：评分公式、排除规则、denylist、awesome 链接提取、徽章颜色。
 * 失败退出码非零（可挂进 validate.yml）。用法：node scripts/smoke.mjs
 */
import { ok } from 'node:assert/strict'
import { exclusionReason, scoreRepo } from './score.mjs'
import { extractRepoRefs } from './fetch.mjs'
import { badgeColor } from './badge.mjs'

let n = 0
function t(name, fn) {
  fn()
  n += 1
  console.log(`  ✓ ${name}`)
}

t('评分：维护性半衰期', () => {
  const { signals } = scoreRepo({ pushedAt: new Date(Date.now() - 180 * 86_400_000).toISOString(), stars: 0, description: 'x'.repeat(40), license: 'MIT', sizeKb: 10 }, 0.2)
  ok(Math.abs(signals.maintenance - Math.exp(-1)) < 1e-9, '180 天未更新应 ≈ e^-1')
})

t('评分：popularity 对数压缩封顶', () => {
  const a = scoreRepo({ pushedAt: new Date().toISOString(), stars: 1000, description: 'x'.repeat(40), license: 'MIT', sizeKb: 1 }, 0.2).signals.popularity
  const b = scoreRepo({ pushedAt: new Date().toISOString(), stars: 100000, description: 'x'.repeat(40), license: 'MIT', sizeKb: 1 }, 0.2).signals.popularity
  ok(a === 1 && b === 1, '1000+ stars 封顶为 1')
})

t('评分：总分 = 加权和', () => {
  const repo = { pushedAt: new Date().toISOString(), stars: 100, description: 'x'.repeat(40), license: 'MIT', sizeKb: 10 }
  const { score, signals } = scoreRepo(repo, 1.0)
  const expect = 0.35 * signals.maintenance + 0.30 * signals.popularity + 0.20 * signals.quality + 0.15 * 1.0
  ok(Math.abs(score - expect) < 1e-12)
})

t('排除规则：占位/无描述/空仓库', () => {
  ok(exclusionReason({ description: 'coming soon placeholder', sizeKb: 10 }) === '占位/WIP 特征')
  ok(exclusionReason({ description: '', sizeKb: 10 }) === '无描述')
  ok(exclusionReason({ description: 'ok', sizeKb: 0 }) === '空仓库（sizeKb=0）')
  ok(exclusionReason({ description: 'ok', sizeKb: 10, fork: true }) === 'fork 仓库')
  ok(exclusionReason({ description: 'ok', sizeKb: 10, archived: true }) === '已归档')
  ok(exclusionReason({ description: 'ok', sizeKb: 10 }) === null)
})

t('awesome 链接提取：排除 topics/动作/徽章 URL', () => {
  const md = [
    'see [repo](https://github.com/Owner/Repo)',
    '[topic](https://github.com/topics/dsh-plugin)',
    '![badge](https://github.com/actions/workflows/ci.yml)',
    'https://github.com/Awesome-dsh-plugin/awesome-dsh-plugin#readme',
    'https://github.com/a/b/tree/main/docs',
  ].join('\n')
  const refs = extractRepoRefs(md)
  ok(refs.includes('owner/repo'), '普通仓库应被提取')
  ok(refs.includes('awesome-dsh-plugin/awesome-dsh-plugin'), '列表自身仓库应被提取（小写）')
  ok(refs.includes('a/b'), '带 /tree/ 后缀的应提取 owner/repo')
  ok(!refs.some((r) => r.startsWith('topics/')), 'topics 链接不得被当作仓库')
  ok(!refs.some((r) => r.startsWith('actions/')), 'actions 链接不得被当作仓库')
})

t('徽章颜色分档', () => {
  ok(badgeColor(0.9) === 'f5c518')
  ok(badgeColor(0.7) === '4176e6')
  ok(badgeColor(0.55) === '81858c')
  ok(badgeColor(0.3) === '9ca3af')
})

console.log(`\n✓ smoke 全部通过（${n} 项）`)
