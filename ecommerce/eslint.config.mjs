import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".netlify/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts"
    ]
  },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react/no-unescaped-entities": "off"
    }
  }
];

export default eslintConfig;
