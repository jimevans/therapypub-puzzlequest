# 0003. One repository, with npm workspaces

- **Status:** accepted
- **Date:** 2026-11-05

## Context

A React app was coming, sharing the API's types with the server and later with
native apps. The server and web app had to build and deploy together on a
cPanel host.

## Decision

One repository and one lockfile, with npm workspaces: `apps/api`, `apps/web`,
`packages/api-client` (generated from the API's description: the only shared
package), and `e2e`. No pnpm, Turborepo, or Nx.

## Consequences

- `npm ci` at the root installs everything; scripts run across workspaces.
- On the host, npm finds the workspaces only if `apps` and `packages` are
  linked beside `package.json`, which the deploy does (see `.cpanel.yml`).
- The web app shares no code with the server: only the generated client.

## Alternatives considered

- **pnpm or Turborepo:** faster for large repositories, but another tool to
  learn and to make work on the host, for little gain at this size.
- **Separate repositories:** the API and its client would drift.
