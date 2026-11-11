# Contributing to PuzzleQuest

This guide is for anyone changing PuzzleQuest's code: what to set up, how
work is organized, and the rules the code keeps, with the reasons for them.
The [README](README.md) covers setting up, running, testing, and deploying in
detail. The reasoning behind the larger choices is in
[docs/decisions](docs/decisions/README.md).

## Getting started

1. Follow the README's **Local setup**: Node 24, a local MongoDB, `npm ci`, and
   an `apps/api/.env` copied from `.env.example`.
2. Fill your database with sample data, and sign in as `admin` with the
   password `puzzlequest sample`:

   ```bash
   npm run seed
   ```

3. Run the server and the web app, each in its own terminal, and open
   <http://localhost:5173>:

   ```bash
   npm run dev
   npm run dev:web
   ```

The repository is npm workspaces: `apps/api` (the server and its API),
`apps/web` (the React app), `packages/api-client` (the client generated from
the API's description), and `e2e` (browser tests).

## Branches, commits, and pull requests

- Work on a branch from an up-to-date `main`, named for what it does:
  `feat/…`, `fix/…`, `test/…`, `docs/…`, or `chore/…`.
- One change per pull request, small enough to review in one sitting. A
  larger piece of work goes in as several, each leaving the site working and
  deployable.
- Commit messages are a single line in the
  [Conventional Commits](https://www.conventionalcommits.org) style, saying
  what the change does for people: `feat: let players delete their own
account`, `fix: leave the health check to the server`.
- The pull request's description says what changed and why, what was tested,
  and anything the person deploying it must do.
- A change that players, staff, administrators, or an app's developers would
  notice gets a line in `CHANGELOG.md`, under "Unreleased". A release moves
  those lines under its version number, sets that number in every
  `package.json` (`npm version X.Y.Z --workspaces --include-workspace-root
--no-git-tag-version`), and is tagged `vX.Y.Z` on `main` once merged. The
  API's own version (`API_VERSION`) changes only when the API does: its minor
  number when it gains something.

## Before opening a pull request

Run what CI runs; all of it must pass:

```bash
npm run lint
npm run typecheck
npm run format:check      # npm run format fixes it
npm run build
npm run size --workspace=@puzzlequest/web
npm run test:coverage
npm run test:e2e          # Chrome and Firefox; see the README's "Browser tests"
```

If you changed an API route or its schemas, run `npm run generate:api` and
commit the regenerated `packages/api-client` files: CI fails if they don't
match the routes.

## Rules the code keeps

These are checked by tests or lint where they can be. Each has a reason; if
one is in your way, raise it rather than working around it.

### The product

- **Players never learn how long a quest is.** No player's screen, and no
  response a player or the public can get, may reveal how many puzzles a
  quest has: the line is open-ended ("Stop 3", never "3 of 5"), and the end
  shows only when it's reached. Only staff and administrators see the count.
  Tests check the raw responses for it.
- **The words players see live in [apps/web/src/copy.ts](apps/web/src/copy.ts)**, such as the
  transit-line wording, which may change. Code uses neutral names
  (`ProgressLine`, `stepNumber`), so the wording can change in one place.
- **Confirmations are in-page dialogs** (`ui/Dialog`), never
  `window.alert` or `window.confirm`.

### The API

- **The web app uses only the public API**, through `@puzzlequest/api-client`,
  as any other client must: a lint rule stops it importing the server's code.
  Anything a screen needs, the API offers to every client.
- **Each route is defined once,** with `defineRoute` in
  [apps/api/src/api/v1/route.ts](apps/api/src/api/v1/route.ts): its access rule, its request schemas, and its
  responses. That one definition registers it with Express, validates its
  requests, and describes it in the OpenAPI document. Errors are problem
  details, with a documented `type` from `Problems`.
- **Every route has a row in the authorization matrix**
  ([apps/api/test/integration/authorization.integration.test.ts](apps/api/test/integration/authorization.integration.test.ts)), saying
  what each kind of user gets; the test fails if a route has none.
- **Responses must match the published description.** Every v1 response in
  the server's tests is checked against it, and every answer the web app's
  tests fake for the API client too: build fakes with
  [apps/web/src/test/fakes.ts](apps/web/src/test/fakes.ts). A full test run also fails if a
  documented success response is never tested.
- **Webhooks are never in the API's description**: only the service that
  calls them uses them, and their signature is checked instead of a session.
- **Routes are kept for native apps.** The API serves future iOS and Android
  apps as well as the web, so a route the web app no longer uses isn't
  removed without asking.
- **Version 1 only grows.** Apps written against `/api/v1` keep working, so
  a change may add routes, optional request fields, response fields,
  enumerated values, and live-update messages, but not remove, rename, or
  narrow anything, or make a request field required. CI compares each pull
  request's API description with its base branch's (oasdiff), and a test
  compares the live updates with `packages/api-client/live-updates.json`.
  A change that must break goes in a new version, `/api/v2`, alongside v1.

### Security

- **The Content Security Policy is strict, and a violation is a bug to fix,**
  not a reason to loosen the policy: no inline scripts or styles, nothing
  loaded from other sites. Browser tests fail on any violation.
- **Nothing personal in the log**: no passwords, tokens, email addresses,
  phone numbers, or query strings; users are named by ID. Server code logs
  through `log()` ([apps/api/src/logger.ts](apps/api/src/logger.ts)), never `console`, which
  lint stops.
- **Inputs are parsed by their schemas**; handlers use what was parsed, never
  the raw body.

### Tests

- **Browser tests use WebdriverIO, over WebDriver BiDi, in Chrome and
  Firefox. Never Playwright.** This is the project's standing choice (see
  [decision 0013](docs/decisions/0013-browser-tests-webdriverio-bidi.md)), and a pull request adding Playwright won't be accepted.
- **The game rules in `apps/api/src/domain` are fully covered**, every branch;
  elsewhere, coverage may not fall below the thresholds in
  `apps/api/vitest.config.js`, which only go up.
- **Screens meet WCAG 2.2 AA.** After every component test, axe-core checks
  what's on screen; browser tests check the key screens of each journey with
  `expectAccessible()`, where contrast and the page's structure can be judged.
  Give a new screen's browser test a check too.
- **The first-load budget is tight**: 118 KB for what every visitor
  downloads first (`apps/web/.size-limit.mjs`). Code only some screens need
  goes in their own chunks.

## Adding things

**An API route:**

1. Define it with `defineRoute` in the right file under `apps/api/src/api/v1/`,
   with zod schemas for its request and responses, following the API's
   conventions ([decision 0023](docs/decisions/0023-api-conventions.md)):
   `questName`, `puzzleName`, `teamName`, and `userName` for names; camelCase
   string enums; `null` for a value that isn't set, and a field left out only
   when the caller may not see it; units in names; and shared shapes as named
   schemas. Stored values are mapped to the API's in `resources.ts` and the
   request schemas, never changed in the database for the API's sake.
2. Give it a row in the authorization matrix.
3. Test it through the app (`apps/api/test/integration/`), including the
   problems it can report.
4. Run `npm run generate:api`, and commit the regenerated client. If a
   live-update message gained something, record it with
   `npm run accept-live-updates --workspace=@puzzlequest/api-client`.
5. Add a line to `CHANGELOG.md`'s "Unreleased" section.

**A screen:**

1. Add its route in `apps/web/src/app/`, loaded lazily; administrators'
   screens go in `adminRoutes.tsx`, so they aren't in first load.
2. Build it from the components in `apps/web/src/ui/`, with CSS Modules on
   the design tokens in `apps/web/src/styles/`.
3. Test its states with Testing Library, faking the API with `fakes.ts`;
   each state a test leaves is checked for accessibility.
4. If it's a journey people depend on, add to the browser tests, with
   `expectAccessible()` on its screens.

**A decision:** if a change settles a question future contributors will ask
("why don't we just use X?"), add a record to
[docs/decisions](docs/decisions/README.md).
