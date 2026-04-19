/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    // Playwright owns e2e/; Vitest only sees src/ unit tests.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
