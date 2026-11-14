import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: https://andrnav.github.io/kokybe/
export default defineConfig({
  plugins: [react()],
  base: '/kokybe/',
});
