/**
 * dsh-recommend browser 半：设置页「插件排行」标签。
 *
 * 遵循官方 client 插件模型（dsh.client manifest + exports["./client"]）：
 *   - 通过 ctx.slots.inject('settings.plugins.tab', ...) 注册排行标签，
 *     与官方「插件列表」标签（id: 'all'）并列（参考
 *     @deepseek-ai/dsh-client-ui-settings-plugin-inventory 的写法）。
 *   - 数据供给：M2 落地时二选一（见 docs/decisions/0003 与 roadmap 验证项）：
 *     a) host 半注册同源 JSON 路由，本半直接 fetch；
 *     b) 官方 Remote 命名空间（需上游白名单）。
 *   - 本骨架先渲染「数据未接入」占位态，保证插件激活即不白屏。
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { RankingsTab, type RankingsTabInjected } from './RankingsTab.tsx'
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
    // M2：接入数据供给（host 同源路由或 Remote 命名空间）后，在这里返回真实数据函数
    loadRankings: async () => {
      throw new Error('dsh-recommend: 数据供给尚未接入（M2）')
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
