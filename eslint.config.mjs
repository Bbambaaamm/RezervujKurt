import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({
  baseDirectory: currentDirectory,
});

const eslintConfig = [
  ...compatibility.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["scripts/**/*.js"],
    rules: {
      // Provozní Node.js skripty v projektu zůstávají záměrně ve formátu CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      ".tmp-tests/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      "out/**",
    ],
  },
];

export default eslintConfig;
