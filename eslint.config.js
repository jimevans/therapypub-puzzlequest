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
    // Web Worker that owns the browser's websocket connection
    files: ["src/public/script/socket.js"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Unused callback parameters (event handlers, Express middleware
      // signatures) are normal; unused variables and imports are not.
      "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true }],
    },
  },
  // Turns off rules that conflict with Prettier; must be last.
  prettier,
];
