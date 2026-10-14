import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { HOST, DEFAULT_PORT } from '../server/start';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: HOST,
    proxy: { '/api': `http://${HOST}:${process.env.PORT ?? DEFAULT_PORT}` },
  },
});
