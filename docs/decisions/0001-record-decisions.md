# 0001. Record decisions

- **Status:** accepted
- **Date:** 2026-11-08

## Context

PuzzleQuest's modernization made many choices that a new contributor will
question, often reasonably: why not JWTs, why not Playwright, why build on the
host. The reasons lived in a planning document and in conversations, where a
newcomer can't find them.

## Decision

Significant decisions are recorded here, one short Markdown file each,
numbered in order: the context, the decision, its consequences, and the
alternatives weighed. Records from 0002 on were written after the fact, from
the modernization plan, in November 2026.

A decision that's reversed keeps its record, marked **superseded by** the new
one, so the history of why stays readable.

## Consequences

- Before reopening a settled question, read its record; a new record can
  overturn an old one, with the new reasons.
- Records are short. Detail belongs in the code, its comments, or the README.

## Alternatives considered

- **Comments in the code alone:** good for the local why, but a decision such
  as "React, not templates" has no single place in the code.
- **The planning document:** thorough, but long, and organized by when work
  happened rather than by question.
