# 0024. Push notifications, sent by the API to phones registered with a session

- **Status:** proposed
- **Date:** 2026-11-12

## Context

The native apps ([0021](0021-native-apps.md)) follow quests live while
they're open, but a closed app hears nothing: a player whose quest starts, or
whose teammate solves the stop they're walking to, finds out only on opening
the app. Decision 0021 settled that the API sends push notifications itself,
to Apple's service (APNs) and to Firebase Cloud Messaging (FCM), for devices
the apps register with it. This record settles how, once for both apps, so
that the API gains what they need in one release.

A spike (`spike/native-apps`) sent real notifications through FCM by signing
its own requests, with no SDK, and APNs works the same way over Node's own
HTTP/2. The puzzle master's messages, sent today by SMS through Twilio, come
to the apps too; [0025](0025-puzzle-master-challenges-in-the-apps.md) settles
how, and adds the `message` kind below.

## Decision

**Registering a phone (API 1.1).** An app registers its push token with the
session it signed in with:

- `PUT /sessions/current/push-target`, with `platform` (`ios` or `android`),
  `token`, `environment` (`production` or `development`, for APNs; Android
  sends `production`), and optional `categories`, the kinds of notification
  it wants (by default, every kind). `DELETE /sessions/current/push-target`
  stops them.
- A session has at most one push target. Ending the session (signing out, its
  expiring, the user being deleted or changing their password) ends it, so a
  phone never gets a signed-out player's notifications. A token is unique: one
  registered by a new session moves to it.
- Apps register again on every launch, since tokens change.

**What's sent.** Notifications go to the phones of an entry's players (the
player, or each member of the team), never to the player whose action caused
them:

| Kind (`category`)             | When                                                                                                  | Example                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `questStarted`                | The entry starts                                                                                      | "Harbor walk has begun. Head for your first stop."      |
| `questPaused`, `questResumed` | The puzzle master pauses or resumes the entry                                                         | "Harbor walk is paused. The clock has stopped."         |
| `stopSolved`                  | A teammate solves the entry's stop                                                                    | "Your team solved The Lighthouse. On to the next stop." |
| `standingsFinal`              | Every entry in a race has finished                                                                    | "Final standings for Harbor walk: your team came 2nd."  |
| `message`                     | The puzzle master sends a message or challenge ([0025](0025-puzzle-master-challenges-in-the-apps.md)) | The puzzle master's text                                |

The game's rules hold on a lock screen as on any other: a notification never
shows a solution or a hint, never says how many stops a quest has, and never
tells a racing player about a rival's progress. A player who solves a stop
alone gets nothing for it; activations and hints send nothing.

**The payload is a contract.** Each release publishes
`push-notifications.json`, beside `openapi.json` and `live-updates.json`: the
schema of what a notification carries, which the apps pin and test against.
Each carries its `category`, the `questName`, the `puzzleName` where there is
one, and a title and body in English written by the server. APNs gets them as
an alert with these as custom keys and the quest as its `thread-id`; FCM as a
notification message with these as data and the quest as its tag. Tapping one
opens the quest, or the puzzle it names. An app with that quest on screen
doesn't show it, since live updates already have.

**Sending.** A subscriber to the quest event bus, beside the live-update one,
finds the entry's players' push targets and sends to APNs (token-based
authentication with the account's signing key, over HTTP/2) or FCM (the HTTP
v1 API, with a service account). No new packages: both are signed requests.
A token either service says is gone is deleted. Sending never fails or delays
the action that caused it; failures are logged. The keys are settings on the
host (APNs's key, key ID, team ID and bundle ID; FCM's service account);
without them, sending is off, as in development and tests.

## Consequences

- One API release (1.1) gives both apps all they need; the apps follow in
  either order.
- Kinds can be added in later 1.x releases without changing registration; an
  app ignores a kind it doesn't know, and asks only for those it shows.
  Per-kind switches in the apps need no server change: they send
  `categories`.
- Text is in English, as the rest of PuzzleQuest is. When the apps are
  translated, they can write their own text from the category and names, as
  they already do for live updates.
- Production needs the Apple Developer account's APNs key and a Firebase
  project's service account set on the host. A development build of the iOS
  app registers with `development`, so it can be tested against production's
  server through APNs's sandbox.
- Server tests check each notification against a fake sender; the apps test
  their handling against `push-notifications.json`, and the iOS app's UI
  tests deliver sample notifications to the simulator with
  `xcrun simctl push`. Real delivery is checked by hand on phones.

## Alternatives considered

- **Registering devices with the user** (`POST /devices`, as the spike did):
  a device registered once keeps receiving after its player signs out, unless
  the app remembers to unregister first. Tying it to the session makes
  signing out enough.
- **Sending to iOS through FCM too**, one service for both: it puts Google's
  SDK in the iOS app, against 0021's preference for each platform's own
  libraries, for little saved on the server.
- **A push service** (OneSignal, Expo's, Amazon SNS): another account and
  dependency for what two signed requests do.
- **Apps writing their own text from the start** (data-only messages): on
  iOS that needs a notification service extension to show anything; English
  from the server is enough until the apps are translated.
