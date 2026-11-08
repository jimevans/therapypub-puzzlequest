# 0014. Contract tests on both sides of the API

- **Status:** accepted
- **Date:** 2026-11-08

## Context

The API's description is a promise to every client, including future native
apps. Nothing checked that the server kept it, or that the web app's tests
faked answers the server could really give.

## Decision

Every v1 response in the server's tests is checked against the published
description (status, media type, body, and problem type), and a full run
fails if any documented success response is never seen. Every answer the
web app's tests fake for the API client is checked the same way. The shared
checker is `packages/api-client/src/contract.ts`.

## Consequences

- No existing test needed changing on the server side; the check found
  undocumented responses, now documented.
- 154 of the web app's 358 tests faked answers the API couldn't give; fakes
  now come from `apps/web/src/test/fakes.ts`.

## Alternatives considered

- **Pact or another consumer-driven contract tool:** heavier, and the
  OpenAPI description already is the contract.
