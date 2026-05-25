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
  ]),
  {
    rules: {
      // React Compiler is not enabled in this project (next.config.ts has no compiler option).
      // Disabling the lint rule to allow standard async data-fetching patterns in effects.
      'react-compiler/react-compiler': 'off',
    },
  },
]);

export default eslintConfig;
