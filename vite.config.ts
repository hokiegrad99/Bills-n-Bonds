/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/Bills-n-Bonds/' matches the GitHub Pages URL for this repo.
// Change to '/' if hosting at the user/org root (e.g. username.github.io).
export default defineConfig({
  base: '/Bills-n-Bonds/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
