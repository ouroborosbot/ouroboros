import tseslint from "typescript-eslint"

export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**"],
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "no-console": "error",
    },
  },
]
