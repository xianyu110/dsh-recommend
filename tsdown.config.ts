/**
 * tsdown 构建配置：三个产物。
 *   lib/host/index.mjs  host 工具半（node）
 *   lib/host/web.mjs    web 数据路由半（node）
 *   lib/client.js       browser 排行标签半
 *
 * client 契约（官方 client-modules 装载链，见 2026-07-23-client-plugin-loading-model）：
 *   - CJS 输出，banner/footer 实现 window.__ModuleLoader__.load({ id, factory })
 *   - external = 平台清单（react 家族 + @deepseek-ai 运行时宿主供给）
 *   - 源码映射供浏览器调试（/plugins/<id>/client.js.map）
 */
import { defineConfig } from 'tsdown'

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

export default defineConfig([
  {
    entry: { index: 'src/host/index.ts', web: 'src/host/web.ts' },
    outDir: 'lib/host',
    format: ['esm'],
    platform: 'node',
    external: [/^@deepseek-ai\//, /^node:/],
    sourcemap: true,
    dts: true,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    external: PLATFORM_MODULES,
    noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    sourcemap: true,
    clean: false,
    dts: false,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-recommend", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
