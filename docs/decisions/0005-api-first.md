# 0005. The API first, described by its own code

- **Status:** accepted
- **Date:** 2026-11-03

## Context

The pages were server-rendered with data injected into them, and the API was
an afterthought with inconsistent errors. Native apps, and possibly other
companies' front ends, were in view.

## Decision

A versioned API at `/api/v1`, resource-oriented, used by the web app exactly
as any other client would. Each route is defined once with `defineRoute`: its
access rule, zod schemas for its request and responses, and the problems it
can report. That definition registers it with Express, validates requests,
and generates the OpenAPI 3.1 description (`zod-openapi`), which generates the
typed client. Errors are RFC 9457 problem details whose `type` clients act on.
Lists are paged with opaque ID cursors.

## Consequences

- The description can't drift from the routes; contract tests check that
  responses match it, on both sides.
- Adding a route means its schemas, a row in the authorization matrix, and
  regenerating the client.
- The reference is published at `/api/v1/docs`.

## Alternatives considered

- **Hand-written OpenAPI:** drifts.
- **GraphQL or tRPC:** tRPC ties clients to TypeScript; GraphQL adds a layer
  that native and third-party clients would have to adopt. Plain HTTP and
  JSON serve every client.
