import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

export default defineConfig({
  envDir: "..",
  plugins: [
    react(),
    checker({
      typescript: true,
    }),
  ],
  server: {
    port: 5800,
    proxy: {
      "/auth": "http://localhost:8787",
      "/health": "http://localhost:8787",
      "/chat": "http://localhost:8787",
      "/chats": "http://localhost:8787",
      "/api": "http://localhost:8787",
      "/ws": {
        target: "http://localhost:8787",
        ws: true,
      },
      "/workspace": "http://localhost:8787",
      "/workspace-file": "http://localhost:8787",
    },
  },
});
