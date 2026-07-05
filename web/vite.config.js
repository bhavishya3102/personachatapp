import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API calls to the Express backend (no CORS headaches).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API calls -> local Express backend. (/avatars are static files in public/, no proxy.)
      "/chat": "http://localhost:8787",
      "/health": "http://localhost:8787",
      "/personas": "http://localhost:8787",
    },
  },
});
