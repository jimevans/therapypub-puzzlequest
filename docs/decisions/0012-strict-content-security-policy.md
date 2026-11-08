# 0012. A strict Content Security Policy

- **Status:** accepted
- **Date:** 2026-11-03

## Context

The site serves people's accounts and runs live events; a script injected
through any mistake could act as them.

## Decision

The policy allows scripts, styles, fonts, and connections only from the site
itself: no inline scripts or styles, no other sites, no `eval`. A violation
is a bug to fix, never a reason to loosen the policy.

## Consequences

- Libraries that inject styles need care: React Aria's rule lives in a
  stylesheet; Swagger UI was chosen for the API reference partly because it
  works under the policy.
- Browser tests record violations and fail on any.
- The legal pages, generated with inline styles, show unstyled until they're
  replaced.

## Alternatives considered

- **Allowing inline styles:** simpler for some libraries, but weaker, and the
  libraries chosen don't need it.
