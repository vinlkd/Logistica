import { defineConfig } from "vite";

const repository =
  process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Logistica";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? `/${repository}/` : "./",
  build: { outDir: mode === "pages" ? "dist-pages" : "dist" },
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
}));
