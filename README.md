# PuzzleQuest

The Therapy Pub and Co. PuzzleQuest website: an Express + MongoDB app with
server-rendered EJS pages, a JSON API under `/api`, and Twilio voice/SMS
integration.

## Requirements

- **Node.js 24.** Production runs Node 24, so local development uses the
  same version. The version is pinned in `.nvmrc`.
- **MongoDB 4.4 or later.** The MongoDB driver used by Mongoose 9 can't
  connect to older servers. MongoDB Community 8.0 is used below. If you know
  which version production runs, use the same major version.

> The `jsonwebtoken` dependency does not load on Node 25 or later. If the app
> fails at startup with a `SlowBuffer` error, check `node -v`.

## Local setup (macOS)

### 1. Install Node 24

Any version manager that reads `.nvmrc` works. With
[fnm](https://github.com/Schniz/fnm):

```bash
brew install fnm
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
exec zsh
```

Then, from the project directory:

```bash
fnm install    # reads .nvmrc
node -v        # v24.x
```

With `--use-on-cd`, fnm switches to Node 24 whenever you `cd` into the
project.

### 2. Install and start MongoDB

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0 mongosh
brew services start mongodb-community@8.0
mongosh --eval 'db.runCommand({ ping: 1 })'
```

The ping should return `{ ok: 1 }`.

### 3. Install dependencies

```bash
npm ci
```

`bcrypt` compiles a native module during install. If you change Node versions,
delete `node_modules` and run `npm ci` again.

### 4. Configure

```bash
cp src/.env.example src/.env
```

The example values work for local development:

- `PQ_RUNTIME_ENVIRONMENT=development` allows sign-in cookies over plain HTTP.
- With `PQ_SMTP_HOST` empty, emails (such as password reset links) are printed
  to the console instead of being sent.
- The Twilio settings can stay empty unless you are testing calls or texts.
  Incoming calls and texts are accepted only with a valid Twilio signature,
  which needs `PQ_TWILIO_AUTH_TOKEN`, and a `PQ_BASE_URL` that matches the
  webhook URLs set in the Twilio console.

`src/.env` is git-ignored. Every variable is documented in
[src/.env.example](src/.env.example). Environment variables take precedence
over values in `src/.env`. The app checks its settings at startup
([src/config.ts](src/config.ts)). If any are missing or invalid, it exits
with a list of the problems.

### 5. Run

```bash
npm run dev    # runs the source; restarts when source files change
```

To run the compiled application the way production does:

```bash
npm run build  # compiles src/ to dist/
npm start
```

Open <http://localhost:3000> and sign up at `/user/register`. The first user
created in an empty database becomes an administrator.

### Debugging in VS Code

The launch configuration uses whichever `node` is on your `PATH`. Start VS
Code from a terminal in the project directory (`code .`) so that it uses
Node 24.

## Tests

```bash
npm test
```

The tests use [Vitest](https://vitest.dev). The integration tests run against
an in-memory MongoDB from `mongodb-memory-server`, so they don't need a local
database.

### Browser tests

```sh
npm run test:e2e
```

These drive the main journeys through the real pages in Chrome and Firefox, with [WebdriverIO](https://webdriver.io/) over WebDriver BiDi: signing up, joining a team, playing a quest from the first call to the last puzzle with a spectator following along, authoring puzzles and quests, and resetting a password. They build the application and run it on an in-memory database, without reading `src/.env`, so they can't send real email or text messages. Both browsers must be installed; WebdriverIO downloads the drivers. `E2E_BROWSER=chrome` or `E2E_BROWSER=firefox` runs just one.

## Linting and formatting

```bash
npm run lint           # ESLint
npm run format         # rewrite files with Prettier
npm run format:check   # report files that Prettier would change
```

ESLint is configured in [eslint.config.js](eslint.config.js). Prettier takes
indentation and line endings from [.editorconfig](.editorconfig), and its
other settings are in [.prettierrc.json](.prettierrc.json).

Browser scripts in `src/public/script` that read variables defined by an
inline `<script>` in their EJS view declare them in a `/* global */` comment
at the top of the file.

## TypeScript and the build

```bash
npm run typecheck  # type-check without emitting anything
npm run build      # compile src/ to dist/
```

The server code is TypeScript. Production runs the compiled JavaScript in
`dist/`, built with `tsc` ([tsconfig.build.json](tsconfig.build.json)); `dist/`
is not committed. Imports name the compiled file, so a module imports
`./config.js` even though the source is `config.ts`. The type-checking settings
are in [tsconfig.json](tsconfig.json).

Shared types live in [src/types.ts](src/types.ts), and the properties that
middleware adds to Express requests are declared in
[src/express.d.ts](src/express.d.ts).

Two versions of TypeScript are installed:

- **TypeScript 7** (the package `typescript-native`) type-checks and builds.
  The `typecheck` and `build` scripts call it directly.
- **TypeScript 6** (the package `typescript`) is there for typescript-eslint,
  which lints the `.ts` files but doesn't support TypeScript 7 yet. Because
  it's installed under the usual name, `npx tsc` runs TypeScript 6; use the npm
  scripts instead.

During development, `npm run dev` and the VS Code launch configuration run the
source with [tsx](https://tsx.is), which handles the mix of `.ts` and `.js`
files without a build.

The views, the static files (including uploaded puzzle media in
`src/public/puzzleData`), and `src/.env` stay in `src/` and are not copied
into `dist/`. The application finds them through [src/paths.ts](src/paths.ts),
so it works the same whether it runs from `src/` or `dist/`.

The browser scripts in `src/public/script` and the tests aren't type-checked
yet.

## Deployment

The hosting environment (cPanel) starts the application through
[src/loader.cjs](src/loader.cjs), which loads the compiled `dist/app.js`.

Deploy with **Deploy HEAD Commit** in cPanel's Git Version Control. It runs the
tasks in [.cpanel.yml](.cpanel.yml), which:

1. Copy the repository, except `.git`, to the application directory.
2. Install the packages listed in `package-lock.json`, including the
   development dependencies the build needs (`npm ci --include=dev`).
3. Compile to `dist/` (`npm run build`).
4. Remove the build and test tools (`npm prune --omit=dev`).
5. Restart the application.

The packages are installed where cPanel's **Run NPM Install** button puts
them: in the application's Node 24 environment, in
`/home/thepuzzlequest/nodevenv/puzzlequest/24/lib/node_modules`.
`node_modules` in the application directory is a link to that folder, and the
deployment recreates the link each time. If the Node version or application
directory changes on cPanel's **Setup Node.js App** page, update the paths at
the top of `.cpanel.yml` to match.

A failing task stops the deployment, and cPanel shows each task's output in
the deployment log. The environment sets `NODE_ENV=production`, which would
make npm skip the development dependencies; that's why the install needs
`--include=dev`. npm 11 warns that it skipped some packages' install scripts;
that's expected, because bcrypt ships prebuilt binaries and the other scripts
only matter for tests.

## Continuous integration

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on
every pull request and on every push to `main`:

- **Lint and test:** installs with `npm ci --engine-strict` on the Node
  version in `.nvmrc`, then runs `npm run lint`, `npm run typecheck`,
  `npm run build`, `npm run format:check`, and `npm test`; a separate job runs the browser tests. The strict engine check fails the build if any dependency no
  longer supports that Node version.
- **Dependency audit:** fails on any advisory of moderate severity or higher
  in the production dependencies (`npm audit --omit=dev`). Advisories that
  affect only development tools, such as linters and test runners, are
  reported in the job's log but don't fail the build.

Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) opens weekly
update PRs for npm packages and GitHub Actions. Minor and patch npm updates
are grouped into one PR. Each major update gets its own PR.
