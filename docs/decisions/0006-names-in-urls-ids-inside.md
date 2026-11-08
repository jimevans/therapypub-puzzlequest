# 0006. Names in URLs, IDs inside, ready for organizations

- **Status:** accepted
- **Date:** 2026-11-03

## Context

Records referred to each other by name, so renaming a user, team, or puzzle
broke links; a puzzle's name alone appeared in 240 lines of code. A
commercial service might later host several organizations.

## Decision

URLs keep readable names (`/quest/harbor-walk`), so links and bookmarks keep
working. Records refer to each other by database ID. Every record belongs to
an organization, a single default one for now, and names are unique within an
organization. The quest event log keeps names, as history. The migration was
delivered as tested `mongosh` commands.

## Consequences

- Renaming is safe.
- Becoming a platform for several organizations is an authorization and
  administration change, not a data migration.

## Alternatives considered

- **IDs in URLs:** robust, but ugly for players, and it broke every printed
  and bookmarked link.
