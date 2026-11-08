# 0007. The game's rules as pure functions

- **Status:** accepted
- **Date:** 2026-11-02

## Context

The quest and puzzle rules were spread through the service code, duplicated,
and partly wrong (a check that could never fire; lost updates when teammates
acted at once).

## Decision

The rules live in `apps/api/src/domain/quest/`: a quest's state and pure
transition functions (start, activate, solve, reveal a hint, pause, skip,
reset), each returning the new state and events, or a typed error. The
service loads, applies a transition, saves with optimistic concurrency
(retrying on a clash), then publishes the events, which drive live updates
and the event log. Scoring is time plus hint penalties, excluding paused time.

## Consequences

- The rules are tested exhaustively, with 100% branch coverage enforced.
- Two teammates acting at once get one success and one clear refusal, never a
  lost update.
- Admin rescue actions (pause, skip, reset a puzzle) go through the same
  rules and the event log.

## Alternatives considered

- **XState or another state-machine library:** the state space is small, and
  a plain typed table is easier for a newcomer to read.
