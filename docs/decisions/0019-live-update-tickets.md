# 0019. The live-update websocket is authorized with tickets

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Private quests need the live-update websocket to know what each connection may
follow. Browsers sign in with a cookie, native apps with a Bearer token, and a
display screen will hold only a share link. A browser can't set headers on a
websocket, and a cookie on one needs an Origin check, since other sites can
open a websocket to this one.

## Decision

A client asks the API for a ticket with whatever credentials it has, then sends
the ticket with its `subscribe` message. A ticket is random, stored only as a
hash, usable once, valid for about a minute, and scoped to what it allows.
They're kept in the database, so a second server process could honor them.

## Consequences

- The websocket needs no knowledge of how clients sign in: access rules stay
  in the API, and every kind of client works the same way.
- Each connection costs one more request, rate-limited per network address.
- A ticket proves access when subscribing only, so losing access later has to
  drop the connection separately.

## Alternatives considered

- **Reading the session cookie on the upgrade:** less code, but it needs an
  Origin check and doesn't suit native apps or share links.
- **A Bearer token or share link in the websocket's URL:** long-lived secrets
  would end up in access logs.
