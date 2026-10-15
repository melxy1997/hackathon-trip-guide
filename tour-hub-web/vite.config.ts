import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { exportToDisplayPlugin } from './vite-plugin-export-to-display.ts'
import { trailExportPlugin } from './vite-plugin-trail-export.ts'
import { offlineDemoPlugin } from './vite-plugin-offline-demo.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), exportToDisplayPlugin(), trailExportPlugin(), offlineDemoPlugin()],
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
