import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    exclude: ["dist/**", "node_modules/**"],
    maxWorkers: 1,
    setupFiles: ["src/__tests__/nerves/global-capture.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/*-entry.ts",
        "src/mind/context/store.ts",
        "src/observability/coverage/cli-main.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
