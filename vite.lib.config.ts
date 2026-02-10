import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.lib.json',
      outDir: 'dist-lib',
      rollupTypes: true
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/TXAPlayerElement.ts'),
      name: 'AsciiCraft',
      formats: ['es', 'umd'],
      fileName: (format) => `ascii-craft.${format === 'es' ? 'mjs' : 'umd.js'}`
    },
    outDir: 'dist-lib',
    emptyOutDir: true,
    rollupOptions: {
      external: ['three', 'postprocessing'],
      output: {
        globals: {
          three: 'THREE',
          postprocessing: 'POSTPROCESSING'
        }
      }
    }
  }
})
