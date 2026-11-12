# 0025. The puzzle master's messages and challenges reach the apps too

- **Status:** proposed
- **Date:** 2026-11-12

## Context

In the play-test, a stop's activation code was earned through a mini-game:
the team reached a venue and spoke to a staff member there, who told the
puzzle master watching the quest console; the puzzle master texted the team a
small puzzle (a **challenge**) with the reply it expected; the team texted
back the answer; the server texted a confirmation to show the staff member;
and the staff member handed over the QR code that activates the puzzle. The
hand-off at the venue is part of the experience, not a workaround.

Today this runs only over SMS, through Twilio (carrier registration, A2P
10DLC, is done). An entry stores one expected reply and its confirmation
(`textResponse`, `textResponseConfirmation`), set by the console's text
message dialog, and the Twilio webhook compares an incoming text with the
whole reply, ignoring letter case. Each text costs money, needs the player's
phone number and consent, and is outside the app the player is already
holding. [0024](0024-push-notifications.md) leaves room for the puzzle
master's messages to become a kind of push notification; this record takes
that up, in the same release.

## Decision

**Both channels, with SMS easy to turn off for app players.** A message or
challenge goes to the entry in the app (shown on the quest screen, and as a
push notification) and by SMS as today. Each quest has one switch in the
console, **Text players who have the app**, on by default; turned off, SMS
goes only to the entry's players who don't have the app. A player "has the
app" when a session of theirs has a push target ([0024](0024-push-notifications.md))
that accepts the `message` kind, so a player who refused notifications on
their phone still gets the text. Players without the app, or with no phone
number on file, are unaffected.

**One challenge per entry, answerable from either channel.** As now, an
entry waits for at most one challenge, and a new one replaces it. It is
stored on the entry, not on a channel, so a team can answer by text or in the
app, whichever comes first. Once answered, it's done for the whole team: the
app shows the confirmation to every teammate live, and the console shows it
to the puzzle master.

**Answers match by keywords**, the rule puzzle answers use
(`containsAllKeywords`): the expected answer is a comma-separated list of
keywords, and an answer is right when it contains each of them, ignoring
letter case, accents, spacing and punctuation. This applies to texted
answers too, so the two channels can't disagree.

**The confirmation is made to be shown.** A right answer in the app opens a
confirmation the player turns toward the staff member: the puzzle master's
confirmation text, large, with the team's (or player's) name, the quest, and
the time it was answered. It stays on the quest screen until the next
challenge. The staff member still hands over the QR code; nothing unlocks by
itself. A wrong answer says so, and the team can try again, limited as
solution attempts are.

**Ad hoc, but one tap to send again.** The puzzle master still writes a
challenge in the console when a team arrives. Each challenge sent is kept
with the quest (its message, keywords and confirmation), and the console's
dialog lists the quest's challenges so the next team to arrive can be sent
the same one with one tap. Writing challenges into a stop when the quest is
designed can come later, from the same stored challenges.

**Plain messages too.** A message with no expected answer (a clue, a "time's
nearly up") goes to the same places and shows in a list of the puzzle
master's messages on the quest screen.

**What API 1.1 gains for this**, beside 0024's registration:

- The player's quest gains `messages` (what the puzzle master has sent the
  entry, newest last, each with its time) and `challenge` (the one waiting,
  if any, or the answered one with its confirmation). The expected answer is
  never sent to players.
- `POST /quests/{questName}/challenge/answers`, with `answer`, for the
  player's entry: the confirmation when it's right, `wrong-answer` when not,
  `wrong-state` when no challenge waits (another teammate may have answered
  it first), `too-many-requests` as for solutions.
- Live updates to the entry's followers and the console when a message is
  sent and when a challenge is answered (by either channel).
- The push kind `message`, with the puzzle master's text as its body.
- For the console: the existing text message routes keep their shape and
  gain an optional challenge to send again by its ID; the quest's challenges
  can be listed; and the quest gains the SMS switch above.

## Consequences

- The play-test's mini-game works for app players without texting them, and
  SMS remains for everyone else, so turning SMS off is one switch per quest,
  not a migration.
- Keyword matching is looser than today's exact match: "the answer is otter"
  is right for `otter`. An expected reply written as a whole phrase still
  works, as one keyword. Production has no quests running, so existing stored
  replies need no conversion.
- Messages are kept with the entry, so a reset clears them with the rest of
  its progress.
- The web player's quest screen can show the same messages and answer field
  from the same API, so web players stop needing SMS too; that's a later,
  web-only change.
- Twilio stays for SMS, and for the voice call that starts a quest, until
  every player has the app or the web screen above.

## Alternatives considered

- **App only**, dropping SMS: cheapest, but strands players without the app,
  and the switch above gets the same saving per quest.
- **A right answer activating the puzzle itself**: faster, but removes the
  staff member from the experience, which the play-test showed was worth
  keeping.
- **Challenges written into stops when the quest is designed**: better for a
  polished quest, but the puzzle master still needs to improvise. Storing
  every challenge sent gets one-tap sending now and is what designed
  challenges would be built on.
- **Exact matching, as now**: unforgiving of a typo in punctuation or an
  extra word, and different from every other answer in the game.
- **A per-player setting instead of a per-quest switch**: more to explain,
  and the choice is the puzzle master's cost to manage, not the player's.
