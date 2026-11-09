# 0013. Browser tests with WebdriverIO over WebDriver BiDi

- **Status:** accepted
- **Date:** 2026-11-03

## Context

The site's journeys need testing in real browsers. The owner contributes to
the W3C WebDriver BiDi specification and values standards-based tools and
the open web.

## Decision

Browser tests use WebdriverIO, over WebDriver BiDi (a hook fails any session
that isn't), in Chrome and Firefox. **Playwright is never used in this
project**, under any circumstances.

## Consequences

- Tests drive real browsers through a W3C standard.
- Firefox sometimes never sends `browsingContext.navigationStarted` when
  navigations overlap, which makes `browser.url()` time out, so Firefox's
  sessions retry that one error once.
- WebdriverIO's selectors are strict: duplicate IDs fail tests, which has
  caught real bugs.

## Alternatives considered

- **Playwright:** ruled out by the owner.
- **Selenium's JavaScript bindings:** standards-based too; WebdriverIO's test
  runner and BiDi support were further along.
