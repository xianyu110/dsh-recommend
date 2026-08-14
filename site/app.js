/* dsh-recommend 静态站：零构建，直接消费 data/rankings.json + data/registry.json */

const SIGNAL_LABELS = { maintenance: '维护性', popularity: '热度', quality: '质量', ecosystem: '生态' }
const SIGNAL_ORDER = ['maintenance', 'popularity', 'quality', 'ecosystem']

/** ISO 时间戳 → 本地可读格式，如 2026-08-14 05:27（UTC+8）。解析失败原样返回，缺省显示 —。 */
function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset() / 60
  const tz = off === 0 ? 'UTC' : `UTC${off > 0 ? '+' : ''}${off}`
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}（${tz}）`
}

let doc = null // { meta, plugins }（registry）

const PAGE_SIZE = 50 // 每页条数
let page = 1 // 当前页（1 起）

function scoreTier(score) {
  if (score >= 0.85) return 'gold'
  if (score >= 0.65) return 'accent'
  if (score >= 0.5) return 'neutral'
  return 'dim'
}

/** HTML 转义：homepage / description 等来自 GitHub API 的文本，避免破坏布局或注入。 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 插件自带静态站 / 主页链接：补全 scheme，空值或与仓库 URL 相同时不展示（避免冗余）。 */
function siteLink(p) {
  const h = String(p.homepage ?? '').trim()
  if (!h) return ''
  const url = h.includes('://') ? h : `https://${h}`
  if (url === p.url) return ''
  return `<a class="act site" href="${esc(url)}" target="_blank" rel="noopener" title="插件静态站 / 文档">🌐 站点</a>`
}

async function load() {
  try {
    const reg = await fetch('../data/registry.json').then((r) => r.json())
    doc = reg
    const cats = new Set(doc.plugins.map((p) => p.category).filter(Boolean))
    const sel = document.getElementById('category')
    for (const c of [...cats].sort()) {
      const opt = document.createElement('option')
      opt.value = c
      opt.textContent = c
      sel.append(opt)
    }
    const exc = doc.plugins.filter((p) => p.excluded).length
    document.getElementById('meta').textContent =
      `数据 ${formatTime(reg.meta.generatedAt)} · 全量 ${reg.meta.counts.topicRepos} · 上榜 ${reg.meta.counts.ranked} · 排除 ${exc} · 评分模型 v${reg.meta.scoringVersion}`
    render()
  } catch (err) {
    document.getElementById('meta').textContent = `加载失败：${err.message}（先跑 node scripts/sync.mjs 生成数据）`
  }
}

function currentRows() {
  const q = document.getElementById('search').value.toLowerCase()
  const view = document.getElementById('view').value
  const cat = document.getElementById('category').value
  const showExcluded = document.getElementById('showExcluded').checked
  const rows = doc.plugins
    .filter((p) => showExcluded || !p.excluded)
    .filter((p) => !cat || p.category === cat)
    .filter((p) => `${p.fullName} ${p.description ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q))
  const sorters = {
    score: (a, b) => b.score - a.score,
    stars: (a, b) => b.stars - a.stars,
    updated: (a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''),
    newest: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  }
  rows.sort(sorters[view])
  return rows
}

function render() {
  const all = currentRows()
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  if (page > totalPages) page = totalPages
  const start = (page - 1) * PAGE_SIZE
  const rows = all.slice(start, start + PAGE_SIZE)

  const list = document.getElementById('list')
  const topScore = rows[0]?.score ?? 0
  list.replaceChildren()
  for (const [i, p] of rows.entries()) {
    const tier = scoreTier(p.score)
    const medal = start + i === 0 ? '🥇' : start + i === 1 ? '🥈' : start + i === 2 ? '🥉' : `#${start + i + 1}`
    const el = document.createElement('article')
    el.className = 'row' + (p.excluded ? ' excluded' : '')
    const pills = SIGNAL_ORDER
      .filter((k) => p.signals?.[k] !== undefined)
      .map((k) => `<span class="pill">${SIGNAL_LABELS[k]} <b>${p.signals[k].toFixed(2)}</b></span>`)
      .join('')
    const repoLabel = `github.com/${esc(p.fullName)}`
    const site = siteLink(p)
    // 被排除（占位/WIP）仓库不引导 Star，避免把用户导去空仓库
    const actions = p.excluded ? '' : `
      <div class="actions">
        <a class="act star" href="${esc(p.url)}" target="_blank" rel="noopener" title="打开仓库，点右上角 ⭐ Star 支持作者 —— 免费，却是对作者最好的感谢">⭐ Star 支持作者</a>
        ${site}
      </div>`
    el.innerHTML = `
      <div class="row-top">
        <span class="rank ${tier}">${medal}</span>
        <div class="name">
          <a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.fullName)}">${esc(p.fullName)}${p.excluded ? `<span class="reason">${esc(p.excluded)}</span>` : ''}</a>
          ${p.category ? `<span class="cat">${esc(p.category)}</span>` : ''}
          <a class="repo-addr" href="${esc(p.url)}" target="_blank" rel="noopener" title="仓库地址（打开即可 Star）">${repoLabel}</a>
        </div>
        <div class="right">
          <span class="stars">★ ${p.stars}</span>
          <span class="score"><span class="num ${tier}">${p.score.toFixed(3)}</span></span>
        </div>
      </div>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      <div class="foot">
        <span class="bar"><i class="${tier}" style="width:${Math.round((p.score / (topScore || 1)) * 100)}%"></i></span>
        <span class="pills">${pills}</span>
      </div>
      ${actions}`
    list.append(el)
  }

  // 分页控制
  const pager = document.getElementById('pager')
  pager.replaceChildren()
  const prev = document.createElement('button')
  prev.type = 'button'
  prev.textContent = '« 上一页'
  prev.disabled = page <= 1
  prev.addEventListener('click', () => { page -= 1; render() })
  const next = document.createElement('button')
  next.type = 'button'
  next.textContent = '下一页 »'
  next.disabled = page >= totalPages
  next.addEventListener('click', () => { page += 1; render() })
  const info = document.createElement('span')
  info.className = 'pager-info'
  info.textContent = `第 ${page} / ${totalPages} 页`
  pager.append(prev, info, next)

  const total = all.length
  document.getElementById('count').textContent = total === 0
    ? '没有匹配的插件'
    : `显示第 ${start + 1}–${start + rows.length} 条 / 共 ${total} 条`
}

/** 筛选/排序变化时回到第一页。 */
function resetAndRender() {
  page = 1
  render()
}

document.getElementById('search').addEventListener('input', resetAndRender)
document.getElementById('view').addEventListener('change', resetAndRender)
document.getElementById('category').addEventListener('change', resetAndRender)
document.getElementById('showExcluded').addEventListener('change', resetAndRender)

load()
