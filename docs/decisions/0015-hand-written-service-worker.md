# 0015. A hand-written service worker

- **Status:** accepted
- **Date:** 2026-11-07

## Context

Measured on phones, repeat visits paint in 0.05 s from a kept copy, against
0.63 s without; first visits are unchanged. Workbox (through
`vite-plugin-pwa`) needs Rollup's native library at build time, a risk on a
host whose native build tools have failed before.

## Decision

A small service worker of our own (`apps/web/src/serviceWorker/`), bundled
on its own: it answers the app's pages from a kept copy refreshed on each
visit, keeps built files, and leaves the API, signing out, media, server
files, emailed-link pages, admin screens, and `/healthz` to the server.

## Consequences

- A deployment reaches a browser on the load after the one that fetched it.
- Any server-owned address must be listed in `routing.ts`, or the worker
  answers it with the app (as `/healthz` once was).
- The README explains how to turn it off for everyone.

## Alternatives considered

- **Workbox:** standard, but its build dependency risked deploys.
- **No service worker:** simpler, but slower repeat visits for players.
