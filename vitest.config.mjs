import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// תצורת Vitest לבדיקות hooks/components (React + jsdom).
// בדיקות ה-.mjs הקיימות תחת src/lib ממשיכות לרוץ דרך node:test (ראו npm run test).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // בדיקות ה-.mjs תחת src/lib רצות דרך node:test (npm run test) ולא כאן.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
