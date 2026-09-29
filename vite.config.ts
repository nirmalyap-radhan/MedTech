import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      ignored: [
        '**/indic-speech-translate-main/**',
        '**/Medical-Prescription-OCR-main/**',
        '**/*.json',
        '**/*.wav',
        '**/*.bin',
      ],
    },
  },
})
