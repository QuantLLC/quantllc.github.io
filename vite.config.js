import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

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
    rollupOptions: {
      input: {
        // Multi-page app routes.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./dashboard/index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
        terms: fileURLToPath(new URL('./terms/index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
});
