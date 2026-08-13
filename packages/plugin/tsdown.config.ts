/**
 * tsdown 构建配置（M0 骨架，M2 落地时按官方共享预设校准 externals）。
 *
 * 契约要求（官方 client 插件模型）：
 *   - host 半产出 lib/host/index.js（main）
 *   - browser 半产出 lib/client.js（exports["./client"]），external 平台清单：
 *     react 家族、@deepseek-ai/*（含 cordis）等运行时由宿主供给，不得打进 bundle。
 */
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/host/index.ts'],
    outDir: 'lib/host',
    format: ['esm'],
    platform: 'node',
    external: [/^@deepseek-ai\//, /^@deepseek-ai\/cordis$/, /^node:/],
    sourcemap: true,
  },
  {
    entry: ['src/client/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'browser',
    // M2 校准：官方 preset 的 external 判定 = 平台清单（react/cordis/@deepseek-ai 系列）
    external: [/^@deepseek-ai\//, /^react$/, /^react\/jsx-runtime$/, /^react-dom$/],
    sourcemap: true,
  },
])
