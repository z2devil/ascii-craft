import { defineConfig } from 'vite'

export default defineConfig({
  base: '/ascii-craft/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    minify: 'esbuild'
  }
})
