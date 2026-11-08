# 0010. The web app uses only the public API

- **Status:** accepted
- **Date:** 2026-11-04

## Context

The owner saw the engine becoming a platform, with other companies building
their own front ends on it. If the site used private routes or data injected
into pages, others couldn't build what it does.

## Decision

The default web app uses only the public v1 API, through the generated
client, with no private routes and nothing injected into pages. A lint rule
stops `apps/web` importing the server's code.

## Consequences

- Anything a screen needs becomes an API feature every client gets.
- Third-party access still needs work when the time comes: API keys or OAuth
  per organization, CORS, rate limits per client, and a versioning policy.

## Alternatives considered

- **Server-rendered data for speed:** faster first paint, but a second,
  private interface.
