import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Production controller URL - update this when deploying
const PRODUCTION_API_URL = "http://104.154.135.248:3005";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Use environment variable if set, otherwise use production URL
  const apiBaseUrl = env.CONTROLLER_SERVICE_URL || PRODUCTION_API_URL;

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
