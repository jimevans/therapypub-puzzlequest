# PuzzleQuest

The Therapy Pub and Co. PuzzleQuest website: an Express + MongoDB app with
server-rendered EJS pages, a JSON API under `/api`, and Twilio voice/SMS
integration.

## Requirements

- **Node.js 20.** The production host is limited to Node 20, so local
  development uses the same version. The version is pinned in `.nvmrc`.
- **MongoDB.** MongoDB Community 8.0 is used below. If you know which version
  production runs, use the same major version.

> The `jsonwebtoken` dependency does not load on Node 25 or later. If the app
> fails at startup with a `SlowBuffer` error, check `node -v`.

## Local setup (macOS)

### 1. Install Node 20

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
node -v        # v20.x
```

With `--use-on-cd`, fnm switches to Node 20 whenever you `cd` into the
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
openssl rand -base64 48
```

Paste the output of `openssl` into `src/.env` as `PQ_SECRET_KEY`. The rest of
the example values work for local development:

- `PQ_RUNTIME_ENVIRONMENT=development` allows sign-in cookies over plain HTTP.
- With `PQ_SMTP_HOST` empty, emails (such as password reset links) are printed
  to the console instead of being sent.
- The Twilio settings can stay empty unless you are testing calls or texts.

`src/.env` is git-ignored. Every variable is documented in
[src/.env.example](src/.env.example). Environment variables take precedence
over values in `src/.env`. The app checks its settings at startup
([src/config.js](src/config.js)). If any are missing or invalid, it exits
with a list of the problems.

### 5. Run

```bash
npm run dev    # restarts when source files change
# or
npm start
```

Open <http://localhost:3000> and sign up at `/user/register`. The first user
created in an empty database becomes an administrator.

### Debugging in VS Code

The launch configuration uses whichever `node` is on your `PATH`. Start VS
Code from a terminal in the project directory (`code .`) so that it uses
Node 20.

## Tests

```bash
npm test
```

The tests use [Vitest](https://vitest.dev). The integration tests run against
an in-memory MongoDB from `mongodb-memory-server`, so they don't need a local
database.

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

## Continuous integration

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on
every pull request and on every push to `main`:

- **Lint and test:** installs with `npm ci --engine-strict` on the Node
  version in `.nvmrc`, then runs `npm run lint`, `npm run format:check`, and
  `npm test`. The strict engine check fails the build if any dependency no
  longer supports that Node version.
- **Dependency audit:** `npm audit` fails on any advisory of moderate severity
  or higher.

Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) opens weekly
update PRs for npm packages and GitHub Actions. Minor and patch npm updates
are grouped into one PR. Each major update gets its own PR.
