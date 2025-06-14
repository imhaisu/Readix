import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      // 确保 HTML 文件也被复制到 dist 根目录
      output: {
        // 在构建完成后，我们需要将 index.html 复制到 dist 根目录
      }
    }
  },
  server: {
    port: 3000
  }
}); 