/**
 * dsh-recommend host 半：四个模型可用工具。
 *
 * 契约：@deepseek-ai/dsh-tools 的 defineTool（官方 cookbook：adding-a-tool）。
 * 数据：只读 registry.json（config.dataUrl 指向的数据仓库产物），本地缓存于
 * config.cachePath（默认 $DSH_HOME/dsh-recommend/registry.json）。
 * 本插件从不执行任何被收录插件的代码（见 SECURITY.md）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-recommend'
export const inject = ['tools']

export interface Config {
  /** 数据仓库 registry.json 的下载地址。 */
  dataUrl: string
  /** 本地缓存路径；不存在时由 sync_registry 拉取。 */
  cachePath: string
}

export function apply(ctx: Context, config: Config) {
  const cachePath = config.cachePath

  /** 读缓存；缺失/损坏时返回 null（工具层提示先 sync）。 */
  async function loadRegistry(): Promise<RegistryDoc | null> {
    try {
      const raw = await readFile(cachePath, 'utf8')
      const doc: RegistryDoc = JSON.parse(raw)
      if (!Array.isArray(doc.plugins)) throw new Error('registry 结构异常')
      return doc
    } catch {
      return null
    }
  }

  ctx.tools.register(defineTool({
    name: 'sync_registry',
    description: '下载最新插件 registry 到本地缓存。数据源：dsh-recommend 数据仓库（每日自动重算）。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fetchedAt: { type: 'string' },
          count: { type: 'number' },
          excluded: { type: 'number' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `registry 已更新：${value.count} 个仓库（${value.fetchedAt}）`,
      }],
    },
    async execute() {
      const res = await fetch(config.dataUrl)
      if (!res.ok) throw new Error(`下载 registry 失败: ${res.status}`)
      const text = await res.text()
      const doc: RegistryDoc = JSON.parse(text)
      if (!Array.isArray(doc.plugins)) throw new Error('下载的 registry 结构异常')
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, text, 'utf8')
      return {
        fetchedAt: doc.meta.generatedAt,
        count: doc.plugins.length,
        excluded: doc.plugins.filter((p) => p.excluded).length,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rank_plugins',
    description: '查询 DSH 插件榜单：按综合分排序，可过滤分类/维度，返回 top N。',
    parameters: {
      limit: { type: 'number', description: '返回条数，默认 10，最大 50' },
      category: { type: 'string', description: '按 hub 分类过滤，如「UI 增强」' },
      sortBy: { type: 'string', enum: ['score', 'stars', 'updated'], description: '排序维度，默认 score' },
      includeExcluded: { type: 'boolean', description: '是否包含被排除（占位/空仓库）条目，默认 false' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rankings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rank: { type: 'number' },
                fullName: { type: 'string' },
                url: { type: 'string' },
                description: { type: 'string' },
                stars: { type: 'number' },
                score: { type: 'number' },
                signals: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    maintenance: { type: 'number' },
                    popularity: { type: 'number' },
                    quality: { type: 'number' },
                    ecosystem: { type: 'number' },
                  },
                },
                pushedAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                excluded: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.rankings ?? [])
          .map((r) => `#${r.rank} ${r.fullName}（score ${r.score}，★${r.stars}）${r.excluded ? ` [${r.excluded}]` : ''}\n  ${r.description}`)
          .join('\n'),
      }],
    },
    async execute(args) {
      const doc = await loadRegistry()
      if (!doc) throw new Error('本地缓存缺失，请先调用 sync_registry')
      const limit = Math.min(args.limit ?? 10, 50)
      let rows = doc.plugins
        .filter((p) => args.includeExcluded || !p.excluded)
        .filter((p) => !args.category || (p.category ?? '').includes(args.category))
        .map((p) => ({
          rank: 0,
          fullName: p.fullName,
          url: p.url,
          description: p.description,
          stars: p.stars,
          score: p.score,
          signals: p.signals,
          pushedAt: p.pushedAt,
          excluded: p.excluded,
        }))
      rows.sort((a, b) => {
        if (args.sortBy === 'stars') return b.stars - a.stars
        if (args.sortBy === 'updated') return (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '')
        return b.score - a.score
      })
      rows = rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }))
      return { rankings: rows }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'search_plugins',
    description: '在插件 registry 中按名称/描述/分类检索（包含被排除条目并标注原因）。',
    parameters: {
      query: { type: 'string', required: true, description: '检索词' },
      limit: { type: 'number', description: '返回条数，默认 10，最大 50' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fullName: { type: 'string' },
                url: { type: 'string' },
                description: { type: 'string' },
                stars: { type: 'number' },
                score: { type: 'number' },
                excluded: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.results ?? []).length === 0
          ? '无匹配结果'
          : (value.results ?? []).map((r) => `${r.fullName}（score ${r.score}，★${r.stars}）${r.excluded ? ` [${r.excluded}]` : ''}\n  ${r.description}`).join('\n'),
      }],
    },
    async execute(args) {
      const doc = await loadRegistry()
      if (!doc) throw new Error('本地缓存缺失，请先调用 sync_registry')
      const q = args.query.toLowerCase()
      const results = doc.plugins
        .filter((p) => (p.fullName + ' ' + (p.description ?? '') + ' ' + (p.category ?? '')).toLowerCase().includes(q))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(args.limit ?? 10, 50))
        .map((p) => ({ fullName: p.fullName, url: p.url, description: p.description, stars: p.stars, score: p.score, excluded: p.excluded }))
      return { results }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'recommend_plugins',
    description: '按用户目标描述推荐插件（v0 关键词匹配，M3 升级为打分推荐）。',
    parameters: {
      goal: { type: 'string', required: true, description: '用户想做的事，如「给 Web 界面加侧边栏」' },
      limit: { type: 'number', description: '返回条数，默认 5，最大 20' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fullName: { type: 'string' },
                url: { type: 'string' },
                description: { type: 'string' },
                score: { type: 'number' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.recommendations ?? []).length === 0
          ? '没有找到明显匹配的插件，试试 search_plugins 换关键词'
          : (value.recommendations ?? []).map((r) => `${r.fullName}（score ${r.score}）\n  理由：${r.reason}\n  ${r.description}`).join('\n'),
      }],
    },
    async execute(args) {
      const doc = await loadRegistry()
      if (!doc) throw new Error('本地缓存缺失，请先调用 sync_registry')
      // v0 规则式：分词（CJK 按字符二元组 + 英文词），对 name/description/category 打分
      const tokens = tokenize(args.goal)
      const scored = doc.plugins
        .filter((p) => !p.excluded)
        .map((p) => {
          const haystack = `${p.fullName} ${p.description ?? ''} ${p.category ?? ''}`.toLowerCase()
          let hits = 0
          for (const t of tokens) if (haystack.includes(t)) hits += 1
          const ratio = tokens.length === 0 ? 0 : hits / tokens.length
          const relevance = Math.min(1, ratio) * 0.6 + p.score * 0.4
          return { p, relevance, hits }
        })
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, Math.min(args.limit ?? 5, 20))
      return {
        recommendations: scored.map(({ p, hits }) => ({
          fullName: p.fullName,
          url: p.url,
          description: p.description,
          score: p.score,
          reason: `命中 ${hits}/${tokens.length} 个关键词；综合分 ${p.score}`,
        })),
      }
    },
  }))
}

/** v0 分词：英文词 + CJK 字符二元组。 */
function tokenize(input: string): string[] {
  const s = input.toLowerCase()
  const tokens = [...(s.match(/[a-z0-9-]+/g) ?? [])]
  for (let i = 0; i < s.length - 1; i += 1) {
    const a = s[i] ?? ''
    const b = s[i + 1] ?? ''
    if (/[\u4e00-\u9fff]/.test(a) || /[\u4e00-\u9fff]/.test(b)) {
      tokens.push(a + b)
    }
  }
  return tokens
}

interface RegistryDoc {
  meta: { generatedAt: string; scoringVersion: number }
  plugins: Array<{
    fullName: string
    url: string
    description: string
    stars: number
    score: number
    category: string | null
    excluded: string | null
    pushedAt: string | null
    signals: Record<string, number>
  }>
}
