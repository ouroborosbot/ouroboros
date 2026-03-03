import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    maxWorkers: 1,
    setupFiles: ["src/__tests__/observability/global-capture.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/engine/data/**"],
    },
  },
})
