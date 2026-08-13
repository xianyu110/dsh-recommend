/**
 * dsh-recommend web 半：把本地缓存的 registry.json 以同源路由供给浏览器。
 *
 * 独立成行（而非并入 host 工具半）是因为 cordis 的 inject 是强依赖：
 * webServer 只在 web profile 存在，headless 下挂载本行会永远 PENDING。
 * 所以 tools 半（main）不带 webServer，本半（./web）带，由 patch 分两行挂载。
 */
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'dsh-recommend-web'
export const inject = ['webServer']

export interface Config {
  /** 本地缓存路径（与 host 半一致）。 */
  cachePath: string
}

export function apply(ctx: Context, config: Config): void {
  // 注册同源 JSON 路由；浏览器半从此路径拉取（避免 CSP/跨域问题）
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
}
