# 0002. TypeScript, strict, compiled by TypeScript 7

- **Status:** accepted
- **Date:** November 2026 (Phase 0 of the modernization)

## Context

The original server was about 95 files of plain JavaScript with JSDoc, no
tests, and bugs a type checker would have caught, such as `isAdmin` used
without calling it.

## Decision

All code is TypeScript with `strict` on. The server was converted file by
file, leaf modules first. Type-checking and the server's build use the native
TypeScript 7 compiler (the package `typescript-native`); TypeScript 6 stays
installed under its usual name only because typescript-eslint doesn't support
7 yet. Development runs the source with `tsx`.

## Consequences

- Imports name the compiled file (`./config.js`), as Node's ES modules require.
- `npx tsc` runs TypeScript 6: use the npm scripts.
- When typescript-eslint supports TypeScript 7, the second copy can go.

## Alternatives considered

- **Staying with JSDoc-checked JavaScript:** no build step, but weaker checks,
  and less familiar to contractors.
- **TypeScript 6 for everything:** slower, and the native compiler was
  already stable.
