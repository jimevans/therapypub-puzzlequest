# 0008. React for the web front end

- **Status:** accepted
- **Date:** 2026-11-05

## Context

The pages were EJS templates with a homemade component layer. A spike
compared React, Svelte, and keeping templates, on the puzzle page, measured
on a phone. Templates painted about twice as fast (1.2 s against 2.8 s for
React) with far less JavaScript, and met the criteria set beforehand for
staying.

## Decision

React, client-rendered with Vite, decided by the owner: future work may be
outsourced, and React is what most developers know, with less custom
rendering code to maintain. Preferring mainstream tools and conventions
became a design goal. Speed is managed by splitting routes, trimming fonts, a
size budget in CI, and a service worker for repeat visits (see 0015).

## Consequences

- First paint is slower than templates would be; the budget (118 KB first
  load) and Lighthouse measurements keep watch.
- Hiring and outsourcing are easier, and React's ecosystem covers authoring
  tools such as drag and drop.
- React Native could later share the API client and types, though not the
  components.

## Alternatives considered

- **Templates:** faster and smaller, but custom code few contractors know.
- **Svelte:** a modest download advantage, a smaller pool of developers, and
  no native path.
- **A PWA instead of native apps:** partly adopted (the service worker); native
  apps remain the likely next step.
