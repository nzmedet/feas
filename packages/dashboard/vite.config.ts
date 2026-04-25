import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.FEAS_API_ORIGIN ?? "http://127.0.0.1:4545",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.FEAS_API_ORIGIN ?? "http://127.0.0.1:4545",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
});
