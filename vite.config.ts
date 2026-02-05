import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/taiwan-stock-reviewer/',
  server: {
    proxy: {
      '/marketdata': {
        target: 'https://api.fugle.tw',
        changeOrigin: true,
      },
      '/v1.0': {
        target: 'https://api.fugle.tw/marketdata',
        changeOrigin: true,
      },
      '/finmind': {
        target: 'https://api.finmindtrade.com/api/v4/data',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/finmind/, ''),
      },
    },
  },
})
