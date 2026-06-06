import { defineConfig } from 'vite';

// Pure static site: the game runs by opening index.html. Vite is dev-only
// tooling for a fast dev server + an optional production bundle.
export default defineConfig({
  root: '.',
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
