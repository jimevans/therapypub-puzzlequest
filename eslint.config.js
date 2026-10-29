import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["coverage/", "src/public/policies/", "src/public/puzzleData/"],
  },
  js.configs.recommended,
  {
    // Server code and tooling configuration
    files: ["**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    // Client-side modules served to the browser
    files: ["src/public/script/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // Turns off rules that conflict with Prettier; must be last.
  prettier,
];
