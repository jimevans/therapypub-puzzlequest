# 0009. The React app's libraries

- **Status:** accepted
- **Date:** 2026-11-05

## Context

With React chosen, each concern needed a library, chosen for being
mainstream and well maintained.

## Decision

- **Vite** builds it; no Next.js or server rendering: Express serves the
  built files from the same origin, which keeps cookies and the security
  policy simple.
- **React Router**, in data mode, for routes, loaders, and blocking unsaved
  edits.
- **TanStack Query** for server data; live updates invalidate queries, which
  refetch, rather than patching the cache by hand.
- **openapi-fetch** with types from **openapi-typescript**, generated from the
  API's description.
- **React Aria Components** for accessible controls.
- **React Hook Form** for forms, with the server's field errors shown beside
  each field (no zod in the browser).
- **CSS Modules** on design tokens, split into raw values and meanings, so
  themes can override meanings later.
- **dnd-kit** for drag and drop, with keyboard support.
- **react-markdown** for puzzle text; raw HTML isn't rendered.

## Consequences

- Libraries are added when a screen first needs them, so first load stays
  within budget.
- React Aria injects a style element by default, which the security policy
  blocks; its rule is in `styles/base.css`, and a marker in `index.html`
  stops the injection.

## Alternatives considered

- **Redux or Zustand:** server state is nearly all there is; TanStack Query
  covers it.
- **Tailwind:** tokens and CSS Modules keep styling in CSS that a designer can
  change.
