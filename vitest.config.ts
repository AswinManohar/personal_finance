import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/frontend/setup.ts'],
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    // The threads pool hangs in sandboxed/CI containers; forks is reliable.
    pool: 'forks',
  },
});
