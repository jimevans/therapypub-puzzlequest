import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "**/coverage/",
      "**/dist/",
      "apps/api/src/public/policies/",
      "packages/api-client/src/schema.d.ts",
      "storage/",
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
    files: ["apps/api/src/public/script/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Web Worker that owns the browser's websocket connection
    files: ["apps/api/src/public/script/socket.js"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    // Server code converted to TypeScript. These rules use the syntax only;
    // type checking is done by `npm run typecheck`.
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // The React app, in the browser. It uses only the public API, through the
    // API client, as any other client must, so it can't use the server's code.
    files: ["apps/web/src/**/*.ts", "apps/web/src/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@puzzlequest/api",
                "@puzzlequest/api/*",
                "**/apps/api/**",
                "**/api/src/**",
              ],
              message:
                "The web app uses only the public API, through @puzzlequest/api-client.",
            },
          ],
        },
      ],
    },
  },
  {
    // The API client runs in the browser too.
    files: ["packages/api-client/src/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
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
    files: ["**/*.ts", "**/*.tsx"],
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
    files: ["apps/api/test/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Turns off rules that conflict with Prettier; must be last.
  prettier,
]);
