import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built prototype works when served from any subpath.
  base: "./",
  server: {
    port: 5173,
  },
});
