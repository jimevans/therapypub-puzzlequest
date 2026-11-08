# 0016. Structured logs on standard error

- **Status:** accepted
- **Date:** 2026-11-08

## Context

The server used scattered `console` calls. On the host, Passenger appends
standard error to `stderr.log` in the app's folder; nothing rotates it, and
the host limits threads.

## Decision

pino and pino-http, writing JSON lines synchronously to standard error, with
no worker-thread transport. Every request gets an ID, sent back in
`X-Request-Id` and shown with server errors, and carried on everything it
logs. Personal data is redacted, query strings are left out, and users are
named by ID. Security events carry an `event` field. A daily cron job rotates
the file (`apps/api/scripts/rotate-log.sh`).

## Consequences

- `console` is barred from server code by lint.
- No error-tracking service yet; errors are found in the log, which nothing
  watches. Alerting is a pre-launch item.

## Alternatives considered

- **pino-roll or other in-process rotation:** needs worker threads.
- **Sentry:** deferred until the business pays for operations.
