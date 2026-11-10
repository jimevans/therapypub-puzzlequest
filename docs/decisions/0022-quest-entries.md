# 0022. A quest's players are entries, each with its own progress

- **Status:** accepted
- **Date:** 2026-11-10

## Context

Competitive quests let several teams race through the same quest, with a
leaderboard. A quest had exactly one assignee, a user or a team, and one set
of progress stored beside its stops. The game rules
([0007](0007-game-rules-as-pure-functions.md)) never mentioned who was
playing, but everything around them found, authorized and notified through
the one assignee.

## Decision

A quest is its definition (its name, who can follow it, and its stops, each
with its puzzle, activation code and card word) and a list of **entries**.
An entry is a user or team playing the quest, with its own progress: the
quest's status, pauses, the reply it waits for by text, and each stop's
status, times, hints and skips. A quest played by one team is a quest with
one entry, so there is one shape, not two kinds of quest.

- Entries are stored inside the quest's document. Saving a quest is checked
  against changes saved since it was loaded (optimistic concurrency), so a
  team's move and an administrator's edit to the stops can't overwrite or
  contradict each other. Teams saving at once retry, as teammates already do.
- Every entry plays the same stops with the same activation codes: one QR
  code per stop, whichever team scans it.
- An entry's progress is kept by puzzle, in the order of the quest's stops.
- Quests stored before entries were converted by a one-off upgrade that ran
  when the server started, in the release that introduced entries; it has
  since been removed.

## Consequences

- The rules are unchanged: they work on one entry's progress at a time.
- Players' routes can find the caller's entry, so playing doesn't need the
  entry in its addresses; the puzzle master's actions will name it.
- Every save of a busy race's quest touches the one document, so several
  teams acting at the same moment cost retries; this is fine for the size of
  race expected, and is noted in the scalability plan.
- Each activity-log event and live update will carry its entry, so screens
  can tell the teams apart.

## Alternatives considered

- **Entries in their own collection:** no contention between teams, but an
  edit to the stops and a team's move would be checked against different
  documents, which can save progress that doesn't fit the new order without
  transactions.
- **A race grouping copies of a quest, one per team:** less change, but two
  kinds of quest, and every edit copied to each team's quest.
