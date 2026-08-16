/**
 * vite.config.ts — admin-web（port 5174，與前台並行開發不衝突）
 */
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = new URL(env.VITE_API_BASE_URL ?? 'https://cv3op1ht.cgapps.dev/api').origin

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@studio/shared/theme.css': resolve(__dirname, 'src/shared/styles/theme.css'),
        '@studio/shared': resolve(__dirname, 'src/shared/index.ts'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
