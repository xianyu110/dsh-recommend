/**
 * dsh-recommend browser 半：设置页「插件排行」标签（M2 已接入数据供给）。
 *
 * 装载链（M2 实测结论，回填 ADR-0003）：第三方 bundle 声明 dsh.client 后，
 * 官方 client-modules 的 node 半扫描 loader 条目中的 dsh.client 声明，把
 * exports["./client"] 的构建产物以 /plugins/<id>/client.js 动态供给浏览器；
 * 数据经 host 半注册的同源路由 /dsh-recommend/registry.json 拉取（无跨域、
 * 无 Remote 白名单依赖）。
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { RankingsTab, type RankingsTabInjected, type RegistryDoc } from './RankingsTab.tsx'
import { en, zh, type RankingsLocaleKey } from './locales.ts'

export type { RankingsTabInjected, RankingsTabProps } from './RankingsTab.tsx'
export type { RankingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-recommend 排行标签文案。 */
    'dshRecommend': RankingsLocaleKey
  }
}

/** 本插件拥有的字典命名空间。 */
export const NS = 'dshRecommend'

/** 设置页注册所需的客户端服务。 */
export const inject = ['slots', 'locale']

/** 向「插件」设置分区贡献「插件排行」标签。 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-recommend: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): RankingsTabInjected => ({
    loadRankings: async (): Promise<RegistryDoc> => {
      const res = await fetch('/dsh-recommend/registry.json', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`registry 路由 ${res.status}（先调用 sync_registry）`)
      }
      return res.json()
    },
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'rankings',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, RankingsTab))
}
