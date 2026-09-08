import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const rootDir = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
