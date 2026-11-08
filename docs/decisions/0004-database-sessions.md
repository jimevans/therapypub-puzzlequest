# 0004. Sessions in the database, not JWTs

- **Status:** accepted
- **Date:** 2026-11-03

## Context

Sign-in used JWTs, but every request already loaded the user from the
database to honor password changes, so a JWT saved nothing. Signing out
couldn't end a token, and the sign-in page handled the token in script.

## Decision

A session is a random token, stored only as a SHA-256 hash in a `sessions`
collection. Browsers get it in an httpOnly, `SameSite=Lax` cookie, set by the
API; native apps ask for it (`"client": "native"`) and send it as a Bearer
token. Sessions last 30 days from last use. Changing a password ends the
user's other sessions; a reset, deletion, or change of role ends all of them.

## Consequences

- Signing out and revoking access take effect at once.
- No signing secret to manage (`PQ_SECRET_KEY` is gone).
- Each request looks the session up: about a third of a millisecond, measured.
- Cookie requests that change things must come from this site (see the
  `requireSameOrigin` middleware); Bearer requests are exempt.

## Alternatives considered

- **Short-lived JWTs with refresh tokens:** revocable, but more moving parts
  for no benefit when the user is loaded anyway.
