import { defineConfig } from 'vite';

// For a user/org page (repo named quantllc.github.io, served at the domain
// root) keep base as '/'. For a project site served under a subpath, set this
// to '/<repo-name>/'.
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
