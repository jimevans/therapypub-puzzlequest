# Changelog

What changes in PuzzleQuest that its players, staff, administrators, and app
developers would notice. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org). The API has its own version, in its
description at `/api/v1/openapi.json`.

## Unreleased

## 1.1.1 — 2026-11-12

### The API

- A quest's `textPlayersWithApp` is now off by default: the puzzle master's
  messages are texted only to players without the app (whose phones don't get
  its push notifications), unless the quest turns it on. Quests made with
  1.1.0 keep the setting they were made with; quests made before then, and
  new ones, don't text players who have the app.

### Administrators

- The quest console's "Text players who have the app" starts unticked, and
  says that players with the app's notifications aren't texted unless it's
  ticked.

## 1.1.0 — 2026-11-12

### The API

- Apps can register a phone for push notifications with
  `PUT /sessions/current/push-target`, giving its platform, token, Apple
  environment, and optionally the kinds of notification it wants, and stop
  them with `DELETE`. A phone belongs to the session that registered it, so
  signing out ends its notifications.
- Players' phones are sent push notifications when their quest starts, when
  the puzzle master pauses or resumes it, when a teammate solves a stop, and,
  once every entry in a race has finished, where they came. They never show
  a solution or a hint, how many stops a quest has, or a rival's progress
  during a race, and the player who caused one isn't sent it. What a
  notification carries is described as `PushNotification` in the API's
  description, and published with each release as `push-notifications.json`.
- The puzzle master's messages reach players in the app as well as by text.
  A player's quest (`GET /quests/{questName}`) shows its entry's `messages`
  and its `challenge`; players answer a challenge with
  `POST /quests/{questName}/challenge/answers`, or by text as before, and a
  right answer shows every teammate the confirmation for the venue's staff.
  Players with the app are sent each message as a push notification
  (`message`). The entry's players and staff following the quest are sent
  `messageSent` and `challengeAnswered`; others, only `questUpdated`.
- A challenge's expected response is now keywords, separated by commas,
  matched as puzzle answers are: an answer is right if it contains each, in
  any letter case and whatever its spacing and punctuation. Before, a texted
  reply had to match the whole response exactly.
- Each challenge sent is kept with the quest: `GET /quests/{questName}/challenges`
  lists them, and a text-messages route given a `challengeId` sends one again.
- A quest's `textPlayersWithApp`, on by default, can be turned off to stop
  texting players who have the app, which shows them the messages anyway.

### Administrators

- The quest console's "Message the players" (formerly "Text the players")
  says who a message reaches, and sets a challenge with the answer's keywords
  and a confirmation for the venue's staff. Challenges sent before are listed
  in it, each sent again to the team chosen with one tap.
- The console shows each team's messages, newest first, and its challenge:
  what it waits for, or when it was answered, and whether in the app or by
  text, as it happens.
- A quest's console has a "Text players who have the app" setting, which saves
  as soon as it's changed.

### Running the site

- The server sends push notifications to iPhones through Apple's service and
  to Android phones through Firebase, each when its settings are on the host:
  `PQ_APNS_KEY_FILE`, `PQ_APNS_KEY_ID`, `PQ_APNS_TEAM_ID` and
  `PQ_APNS_BUNDLE_ID` for Apple, and `PQ_FCM_SERVICE_ACCOUNT_FILE` for
  Firebase. The two files are the services' key files, kept on the host
  outside the application's folder; the server won't start if either can't
  be read. A phone either service says is gone is forgotten.

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
