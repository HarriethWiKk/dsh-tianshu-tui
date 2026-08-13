import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** dsh-tui 独立测试配置：跑 tests/ 下全部 spec（node 环境，无 jsdom 依赖）。 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
})
