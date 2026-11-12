# Changelog

What changes in PuzzleQuest that its players, staff, administrators, and app
developers would notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org). The API has its own version, in its
description at `/api/v1/openapi.json`.

## Unreleased

### The API

- Apps can register a phone for push notifications with
  `PUT /sessions/current/push-target`, giving its platform, token, Apple
  environment, and optionally the kinds of notification it wants, and stop
  them with `DELETE`. A phone belongs to the session that registered it, so
  signing out ends its notifications.

### Running the site

- The server sends push notifications to iPhones through Apple's service and
  to Android phones through Firebase, each when its settings are on the host:
  `PQ_APNS_KEY_FILE`, `PQ_APNS_KEY_ID`, `PQ_APNS_TEAM_ID` and
  `PQ_APNS_BUNDLE_ID` for Apple, and `PQ_FCM_SERVICE_ACCOUNT_FILE` for
  Firebase. The two files are the services' key files, kept on the host
  outside the application's folder; the server won't start if either can't
  be read. A phone either says
  is gone is forgotten. Nothing sends notifications yet; the next changes
  add them.

## 1.0.2 — 2026-11-12

### The API

- Starting and resetting a quest now send its followers `questUpdated` over
  the live-update websocket, as pausing and the puzzle master's other changes
  do, so a screen following the quest shows them at once. Before, they sent
  nothing, and a quest reset while a player had it open showed only at the
  screen's next fetch.

## 1.0.1 — 2026-11-11

### The API

- The API's description no longer says responses can't have fields it
  doesn't list. Version 1 may add fields, and a client generated from 1.0.0's
  description (such as with Apple's Swift OpenAPI Generator) would have
  rejected them. What the API sends is unchanged.

## 1.0.0 — 2026-11-11

The first stable release. What PuzzleQuest does at 1.0:

### Players

- Sign up, verify an email address, reset a forgotten password, and delete
  their account.
- Join a team with its join code.
- See the quests they play, kept up to date as they start and finish.
- Play a quest stop by stop: activate each stop by scanning its QR code or
  typing its code, solve its puzzle (text, image, audio, or video), and reveal
  hints, each adding its time penalty. The clock shows their time as they go.
  How long a quest is stays hidden until they finish it.
- Race other teams on the same quest, and see the standings once their team
  finishes.
- Answer the puzzle master's text messages by replying to them.

### Spectators

- Follow a quest as it happens, on a phone or a big screen, without signing
  in, or through a share link when the quest is private.
- In a race, follow a live leaderboard, ranked by total time; while a race is
  on, each team's progress stays hidden from the others.

### Staff

- Follow every quest, see where each team is, and show the players any stop's
  QR code.

### Administrators

- Write puzzles, with hints and their penalties, and upload their media.
- Build quests from puzzles, in any order, with an activation code and an
  optional card word for each stop; make a quest public or private; enter
  players or teams.
- Run quests from the console: start, pause, resume, and reset a quest for
  one entrant or all of them; skip or reset a stop; text the players; and
  read the quest's event log.
- Print a quest's run book, and its QR codes as business cards.
- Manage users, their roles, and teams.

### The API

- Version 1 of the API, at `/api/v1`, used by the web app and open to native
  apps: described by OpenAPI at `/api/v1/openapi.json`, with a reference at
  `/api/v1/docs`.
- Sessions by cookie for the web, and by bearer token for apps.
- Live updates over a websocket at `/api/v1/updates`, with tickets.
- Errors as problem details (RFC 9457), each with a documented type.
- Version 1 only grows from here: routes, fields, values, and live-update
  messages may be added, but nothing is removed or changed
  ([decision 0023](docs/decisions/0023-api-conventions.md)).
