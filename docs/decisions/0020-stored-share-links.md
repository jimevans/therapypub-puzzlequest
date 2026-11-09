# 0020. Share links are stored, hashed tokens

- **Status:** accepted
- **Date:** 2026-11-09

## Context

Someone without an account, such as a relative or a lobby screen, may need to
follow a private quest. Its players should be able to invite them, and an
invitation has to be withdrawable.

## Decision

A share link holds a random token, stored only as a hash, as password resets
are. It belongs to a quest, has a label, and expires in 30 days unless staff
choose otherwise. The quest's assigned players and staff can make links; the
link's maker or staff can revoke one, which cuts off anyone following through
it at once.

The token travels in the page address's fragment, which browsers never send
to a server, and to the API in the `X-Share-Token` header, so it stays out of
access logs.

## Consequences

- Each link can be revoked by itself, and no new server secret is needed.
- The token can be shown only when it's made.
- A link works for whoever has it, so a forwarded link admits someone else
  until it expires or is revoked.
- A connection already open when a link expires, rather than when it's
  revoked, stays until it reconnects; what it can fetch is refused at once.

## Alternatives considered

- **Signed links:** no database lookup, but a single link can't be revoked
  without a list of revoked links, and they need a server secret.
- **The token in a query string:** simpler, but it would be recorded in the
  web server's access logs.
