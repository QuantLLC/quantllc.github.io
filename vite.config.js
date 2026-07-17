import { defineConfig } from 'vite';

// Base path is set for GitHub Pages project sites. For a user/org page
// (e.g. quant.github.io served at the domain root) keep it as '/'.
export default defineConfig({
  base: '/',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
});
