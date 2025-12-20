import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.CONTROLLER_SERVICE_URL || 'http://localhost:3005',
          changeOrigin: true
        }
      }
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.CONTROLLER_SERVICE_URL || 'http://localhost:3005')
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };
});
