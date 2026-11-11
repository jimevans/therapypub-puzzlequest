# 0023. The API's conventions, for version 1.0

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The API is about to be frozen as version 1.0, which native apps in Swift and
Kotlin ([0021](0021-native-apps.md)) will be written against. It had grown
route by route: statuses and puzzle types were numbers whose meaning lived in
descriptions, an unset value was sometimes `null` and sometimes absent, one
thing had several names (`name` and `puzzleName`, `solutionDisplayText` and
`solutionText`, `nextHintToDisplay` and `hintsRevealed`), and the same shapes
were repeated inline, so generated clients got a type for each copy. The data
stored in production used the old numbers and names, and changing it would
need a migration.

## Decision

The wire format follows these conventions, and new routes and fields keep to
them:

- **Names:** a thing is named the same way in every path, body, response,
  and live update: `questName`, `puzzleName`, `teamName`, `userName`. A
  quest's stop is named by its puzzle's `puzzleName`. Path parameters use the
  same names (`/quests/{questName}/puzzles/{puzzleName}`).
- **Enumerated values** are camelCase strings, declared as `enum` in the
  schema: statuses (`notStarted`, `awaitingActivation`, …), puzzle types,
  roles (`player`, `staff`, `admin`), entrant kinds (`player`, `team`), and
  event types (`puzzleSolved`), matching the live updates' `message`s.
- **Null for unset, absent for hidden:** a value that isn't set, such as a
  time that hasn't come, is present as `null`. A field is absent only when
  the caller isn't allowed to see it, such as a team's join code or a stop's
  activation code for a player; its description says so.
- **Units in names:** `timePenaltySeconds`, `elapsedMs`.
- **One schema per shape:** shared shapes are named components (`Clock`,
  `Progress`, `HintDefinition`, `NextHint`, `Entrant`, and a page wrapper for
  each kind of item, such as `QuestPage`), so a generated client has one type
  for each.
- **Clients tolerate what they don't know:** 1.0 can gain fields, enumerated
  values, problem types, and live-update messages without a new version, so
  clients must ignore unknown fields and treat unknown values sensibly, such
  as an unknown status as unknown.
- **Stored values are mapped at the boundary:** the database keeps what it
  always has (numbered statuses and types, authorization levels, `"user"` for
  a player entrant, PascalCase event types, penalties as `timePenalty` in
  seconds). The resource functions in `apps/api/src/api/v1/resources.ts` and
  the request schemas in `apps/api/src/schemas/` map between the two, with
  the enumerations in `apps/api/src/schemas/enums.ts`. Nothing stored changed.

## Consequences

- Deploying 1.0 needed no data migration; production's data works as it is.
- Generated Swift and Kotlin clients get real enums and one type per shape.
- A change to the wire format is a change to the mapping, not to storage, and
  storage can change without changing the API.
- Response schemas still forbid fields they don't list, so the server's tests
  catch a field leaking into a view (decision
  [0011](0011-quest-length-stays-hidden.md)); clients are told to tolerate
  new ones regardless.
- Problem details keep RFC 9457's shape, whose extension members (`errors`,
  `requestId`) are absent when they don't apply.

## Alternatives considered

- **Migrating the stored data to the API's values:** one representation,
  but a migration of production's data, and storage tied to the wire format.
- **Leaving the numbers, documented:** no change, but every client would
  repeat the table of meanings, and generated clients would get bare
  integers.
