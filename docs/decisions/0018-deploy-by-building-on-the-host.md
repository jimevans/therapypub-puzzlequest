# 0018. Deploys build on the host

- **Status:** accepted
- **Date:** 2026-11-05

## Context

cPanel's Git Version Control deploys a commit by running `.cpanel.yml` on the
host. Building there keeps built files out of the repository, which the
owner prefers.

## Decision

The deploy installs packages, compiles the server, builds the web app on two
CPUs (more fail to start threads), removes the build tools, writes the
deployed commit, and restarts the app.

## Consequences

- Three deploys have failed while building: the bundler's threads, the CSS
  minifier's native library (now esbuild), and memory. A redeploy worked
  each time.
- A failed web build can leave the new server's files beside the old web
  app's, unrestarted.
- When this becomes a problem, the plan is for CI to build an archive the
  deploy downloads (attached to a release, not committed), deploying each
  version to its own folder, and checking `/healthz` after.

## Alternatives considered

- **Committing built files to a deploy branch:** reliable, but puts build
  output in the repository.
