/* dsh-recommend 静态站：零构建，直接消费 data/rankings.json + data/registry.json */

const SIGNAL_LABELS = {
  maintenance: '维护性',
  popularity: '热度',
  quality: '质量',
  ecosystem: '生态',
}

let doc = null // { meta, plugins }（registry）
let ranked = [] // 榜单行

async function load() {
  try {
    const [reg, rank] = await Promise.all([
      fetch('../data/registry.json').then((r) => r.json()),
      fetch('../data/rankings.json').then((r) => r.json()),
    ])
    doc = reg
    ranked = rank.rankings
    const cats = new Set(doc.plugins.map((p) => p.category).filter(Boolean))
    const sel = document.getElementById('category')
    for (const c of [...cats].sort()) {
      const opt = document.createElement('option')
      opt.value = c
      opt.textContent = c
      sel.append(opt)
    }
    document.getElementById('meta').textContent =
      `数据时间 ${reg.meta.generatedAt} · 全量 ${reg.meta.counts.topicRepos} · 上榜 ${rank.rankings.length} · 排除 ${reg.meta.counts.excluded} · 评分模型 v${reg.meta.scoringVersion}`
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
  let rows = doc.plugins
    .filter((p) => showExcluded || !p.excluded)
    .filter((p) => !cat || p.category === cat)
    .filter((p) => `${p.fullName} ${p.description ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q))
  const sorters = {
    score: (a, b) => b.score - a.score,
    stars: (a, b) => b.stars - a.stars,
    updated: (a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''),
  }
  rows = [...rows].sort(sorters[view])
  return rows.slice(0, 200)
}

function render() {
  const tbody = document.querySelector('#table tbody')
  const rows = currentRows()
  tbody.replaceChildren()
  for (const p of rows) {
    const tr = document.createElement('tr')
    if (p.excluded) tr.className = 'excluded'
    const signals = Object.entries(p.signals ?? {})
      .map(([k, v]) => `${SIGNAL_LABELS[k] ?? k} ${v.toFixed(2)}`)
      .join(' · ')
    tr.innerHTML = `
      <td>${p.excluded ? '—' : p.score > 0.8 ? '🥇' : p.score > 0.6 ? '🥈' : p.score > 0.4 ? '🥉' : ''}</td>
      <td class="name"><a href="${p.url}" target="_blank" rel="noopener">${p.fullName}</a>${p.excluded ? `<span class="reason">${p.excluded}</span>` : ''}</td>
      <td class="desc" title="${(p.description ?? '').replaceAll('"', '&quot;')}">${p.description ?? ''}</td>
      <td>${p.stars}</td>
      <td class="score">${p.score.toFixed(3)}</td>
      <td class="signals">${signals}</td>`
    tbody.append(tr)
  }
  document.getElementById('count').textContent = `显示 ${rows.length} 条`
}

document.getElementById('search').addEventListener('input', render)
document.getElementById('view').addEventListener('change', render)
document.getElementById('category').addEventListener('change', render)
document.getElementById('showExcluded').addEventListener('change', render)

load()
