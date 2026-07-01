import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python virtualenv for the data pipeline + ml/ scripts — some deps (e.g.
    // scikit-learn's HTML-repr widget) ship stray .js files ESLint would otherwise scan.
    "venv/**",
    "ml/.venv/**",
  ]),
]);

export default eslintConfig;
