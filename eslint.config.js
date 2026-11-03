import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "coverage/",
      "dist/",
      "src/public/policies/",
      "src/public/puzzleData/",
    ],
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
    // Server code converted to TypeScript. These rules use the syntax only;
    // type checking is done by `npm run typecheck`.
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
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
  {
    // The same rule for TypeScript, which replaces the JavaScript one there.
    files: ["**/*.ts"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Test doubles stand in for Express and Mongoose objects without
    // implementing their whole types, and response bodies are checked
    // property by property.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Turns off rules that conflict with Prettier; must be last.
  prettier,
]);
