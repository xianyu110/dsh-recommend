/**
 * dsh-recommend web 半：把本地缓存的 registry.json / history.json 以同源路由供给浏览器，
 * 并提供 POST /dsh-recommend/sync 供设置页「刷新数据」按钮触发更新。
 *
 * 独立成行（而非并入 host 工具半）是因为 cordis 的 inject 是强依赖：
 * webServer 只在 web profile 存在，headless 下挂载本行会永远 PENDING。
 * 所以 tools 半（main）不带 webServer，本半（./web）带，由 patch 分两行挂载。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'dsh-recommend-web'
export const inject = ['webServer']

export interface Config {
  /** 本地缓存路径（与 host 半一致）。 */
  cachePath: string
  /** 数据仓库 registry.json 下载地址（POST /sync 拉取用，与 host 半一致）。 */
  dataUrl: string
  /** 可选：历史数据缓存路径（默认 cachePath 同级 history.json）。 */
  historyPath?: string
}

export function apply(ctx: Context, config: Config): void {
  const historyPath = config.historyPath ?? config.cachePath.replace(/registry\.json$/, 'history.json')

  /** 拉取最新 registry 并覆写本地缓存（与 host 半 sync_registry 相同逻辑）。 */
  async function refresh(): Promise<{ fetchedAt: string; count: number }> {
    const res = await fetch(config.dataUrl)
    if (!res.ok) throw new Error(`下载 registry 失败: ${res.status}`)
    const text = await res.text()
    const doc = JSON.parse(text) as { meta?: { generatedAt?: string }; plugins?: unknown[] }
    if (!Array.isArray(doc.plugins)) throw new Error('下载的 registry 结构异常')
    await mkdir(dirname(config.cachePath), { recursive: true })
    await writeFile(config.cachePath, text, 'utf8')
    return { fetchedAt: doc.meta?.generatedAt ?? new Date().toISOString(), count: doc.plugins.length }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-recommend/registry.json',
    async handler(_req, res) {
      try {
        const body = await readFile(config.cachePath)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(body)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('registry cache missing — run sync_registry first')
      }
    },
  }), 'dsh-recommend: registry route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-recommend/history.json',
    async handler(_req, res) {
      try {
        const body = await readFile(historyPath)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(body)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('history cache missing — run sync_registry first')
      }
    },
  }), 'dsh-recommend: history route')

  // 设置页「刷新数据」：拉取最新 registry 覆写缓存。只读数据，不执行任何插件代码。
  // 注：WebRoute 契约无 method 字段（同路径下方法不可区分），故在 handler 内校验 req.method。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-recommend/sync',
    async handler(req, res) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed — use POST')
        return
      }
      try {
        const result = await refresh()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, ...result }))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
      }
    },
  }), 'dsh-recommend: sync route')
}
