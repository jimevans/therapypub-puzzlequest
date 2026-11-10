# 0011. Players never learn how long a quest is

- **Status:** accepted
- **Date:** 2026-11-04

## Context

Not knowing how many puzzles remain is part of the fun. Public spectator
views can be opened by players too.

## Decision

No player screen or response, and no public view, reveals how many puzzles a
quest has: the line is open-ended, and the end shows only when reached. Only
signed-in staff and administrators see the count. Summaries leave out
anything that would reveal it, such as per-puzzle progress.

## Consequences

- Tests check raw responses for unreached puzzles' names and counts.
- A web app's test once faked staff's quest list with puzzle lists the real
  API leaves out; contract tests now catch fakes like that.
- Races: while a quest has several entries and not every one has finished,
  everyone but staff and administrators sees only the standings (who plays,
  their status, and their total time), with no stops: not in the public
  view, its puzzle pages, or its live updates, which tell rivals only that
  an entry changed. Otherwise a rival could read the leaders' puzzles,
  hints, and answers, or learn the quest's length from a team that has
  finished. Once every entry has finished, the views show each entry's
  reached stops as before.

## Alternatives considered

- **Showing progress as "3 of 5":** clearer, but spoils the experience.
