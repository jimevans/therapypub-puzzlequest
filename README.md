# PuzzleQuest

The Therapy Pub and Co. PuzzleQuest website: a React web app (`apps/web`) on
an Express + MongoDB API (`apps/api`, under `/api/v1`), with Twilio voice/SMS
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
cp apps/api/.env.example apps/api/.env
```

The example values work for local development:

- `PQ_RUNTIME_ENVIRONMENT=development` allows sign-in cookies over plain HTTP.
- With `PQ_SMTP_HOST` empty, emails (such as password reset links) are printed
  to the console instead of being sent.
- The Twilio settings can stay empty unless you are testing calls or texts.
  Incoming calls and texts are accepted only with a valid Twilio signature,
  which needs `PQ_TWILIO_AUTH_TOKEN`, and a `PQ_BASE_URL` that matches the
  webhook URLs set in the Twilio console.

`apps/api/.env` is git-ignored. Every variable is documented in
[apps/api/.env.example](apps/api/.env.example). Environment variables take precedence
over values in `apps/api/.env`. The app checks its settings at startup
([apps/api/src/config.ts](apps/api/src/config.ts)). If any are missing or invalid, it exits
with a list of the problems.

### 5. Run

```bash
npm run dev    # runs the source; restarts when source files change
```

To work on the React app, run this in a second terminal too, and open <http://localhost:5173>. Vite shows changes as you save them, and sends the rest (the API, signing out, uploaded media, and the server's own static files) to the server on port 3000:

```bash
npm run dev:web
```

To run the compiled application the way production does:

```bash
npm run build  # compiles the server and builds the web app
npm start
```

Open <http://localhost:3000>. To fill your development database with sample
data (people of every role, a team, puzzles of every kind with their media,
and quests in every state), run:

```bash
npm run seed              # into an empty database
npm run seed -- --reset   # replacing what's there
```

It prints who's who; everyone's password is `puzzlequest sample`. It runs only
when `PQ_RUNTIME_ENVIRONMENT` is `development`, as `.env.example` sets it.

Or sign up at `/user/register`, and make yourself an administrator:

```bash
npm run build --workspace=@puzzlequest/api
node apps/api/dist/admin/cli.js promote YOUR_USER_NAME
```

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
database. The React app's tests use [Testing Library](https://testing-library.com/) with jsdom.

### Browser tests

```sh
npm run test:e2e
```

These drive the main journeys through the real pages in Chrome and Firefox, with [WebdriverIO](https://webdriver.io/) over WebDriver BiDi: signing up, joining a team, playing a quest from the first call to the last puzzle with a spectator following along, authoring puzzles and quests, and resetting a password. They build the application and run it on an in-memory database, without reading `apps/api/.env`, so they can't send real email or text messages. Both browsers must be installed; WebdriverIO downloads the drivers. `E2E_BROWSER=chrome` or `E2E_BROWSER=firefox` runs just one. The camera is refused in those sessions, so they use the fall-back to typing a code; `e2e/camera-specs` runs in a separate Chrome session whose fake camera shows a QR code, to test scanning.

Chrome runs every spec with the service worker. Firefox runs them without service workers, apart from `specs/serviceWorker.e2e.ts`, which has a Firefox session of its own: on CI's Linux machines, WebdriverIO waits forever for the network record of some page loads the worker answers in Firefox, though the pages load. To run Firefox tests with a particular version, download it (`npx @puppeteer/browsers install firefox@159.0`) and set `E2E_FIREFOX_BINARY` to its program.

## Repository layout

This is an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) monorepo with one lockfile. Run `npm ci` and the `npm run` commands from the repository's root.

- `apps/api`: the server, with the v1 API and the server-rendered pages, and its tests.
- `apps/web`: the React website, which is replacing the server-rendered pages one screen at a time. It uses only the public API. The server serves its built files, and lists its pages in [apps/api/src/routes/web.ts](apps/api/src/routes/web.ts).
  - `src/app`: the router and what wraps every page. Adding a page means adding it here and to the server's list.
  - `src/ui`: the shared components, built on [React Aria Components](https://react-spectrum.adobe.com/react-aria/) for accessibility.
  - `src/screens`: the screens, by area.
  - `src/styles`: the design's tokens in `tokens.css`. Components use the meanings there, such as `--accent`, never raw colors, and style themselves with CSS Modules.
  - What every page downloads first, and each screen on top of that, has a budget in `apps/web/.size-limit.mjs`, which CI checks after building (`npm run size --workspace=@puzzlequest/web`). The files a screen loads come from the build's manifest, so adding a screen means adding only its source file and limit. Importing a large library from `src/app` or `src/ui/PageShell.tsx` adds to it for every page.
- The API's reference is at `/api/v1/docs` (Swagger UI, from the description at `/api/v1/openapi.json`), on any running copy of the site.
- `packages/api-client`: a typed client of the API, and `followQuest`, which follows a quest's live updates and reconnects by itself, generated from the API's OpenAPI description. After changing a route, run `npm run generate:api` and commit the result; CI fails if the generated files don't match the routes. The generator asks for TypeScript 5, but runs correctly on the project's TypeScript 6, which an `overrides` entry in the root `package.json` allows.
- `e2e`: the browser tests, which exercise the whole product.
- `storage`: uploaded puzzle media, not committed.

## Linting and formatting

```bash
npm run lint           # ESLint
npm run format         # rewrite files with Prettier
npm run format:check   # report files that Prettier would change
```

ESLint is configured in [eslint.config.js](eslint.config.js). Prettier takes
indentation and line endings from [.editorconfig](.editorconfig), and its
other settings are in [.prettierrc.json](.prettierrc.json).

## TypeScript and the build

```bash
npm run typecheck  # type-check without emitting anything
npm run build      # compile apps/api/src/ to apps/api/dist/, and build apps/web/ to apps/web/dist/
```

The server code is TypeScript. Production runs the compiled JavaScript in
`apps/api/dist/`, built with `tsc` ([tsconfig.build.json](apps/api/tsconfig.build.json)); `dist/`
is not committed. Imports name the compiled file, so a module imports
`./config.js` even though the source is `config.ts`. The type-checking settings
are in [tsconfig.base.json](tsconfig.base.json).

Shared types live in [apps/api/src/types.ts](apps/api/src/types.ts), and the properties that
middleware adds to Express requests are declared in
[apps/api/src/express.d.ts](apps/api/src/express.d.ts).

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

The views and static files stay in `apps/api/src/` and are not copied into
`apps/api/dist/`. Uploaded puzzle media lives in `storage/puzzleData`, outside
the code, and isn't committed. The application finds all of these through
[apps/api/src/paths.ts](apps/api/src/paths.ts), so it works the same whether it
runs from `src/` or `dist/`.

The browser scripts in `apps/api/src/public/script` and the tests aren't type-checked
yet.

## Deployment

The hosting environment (cPanel) starts the application through
[apps/api/loader.cjs](apps/api/loader.cjs), which loads the compiled `apps/api/dist/app.js`.

Deploy with **Deploy HEAD Commit** in cPanel's Git Version Control. It runs the
tasks in [.cpanel.yml](.cpanel.yml), which:

1. Copy the repository, except `.git`, to the application directory. Uploaded
   media in `storage/` isn't in the repository, so it's left alone. The
   commit deployed is written to `DEPLOYED_COMMIT`, which the server logs on
   starting and backups record.
2. Install the packages listed in `package-lock.json`, including the
   development dependencies the build needs (`npm ci --include=dev`).
3. Compile the server to `apps/api/dist/` and build the web app to
   `apps/web/dist/` (`npm run build`), on two CPUs, because the web app's
   bundler otherwise can't start its threads on the shared host. A failed web
   build leaves the previous built files in place.
4. Remove the build and test tools (`npm prune --omit=dev`).
5. Restart the application.

The packages are installed where cPanel's **Run NPM Install** button puts
them: in the application's Node 24 environment, in
`/home/thepuzzlequest/nodevenv/puzzlequest/24/lib/node_modules`.
`node_modules` in the application directory is a link to that folder, and the
deployment recreates the link each time. The workspaces are linked into that
folder too, because npm looks for them beside `package.json`. Production has no
`.env` file: its settings are on cPanel's **Setup Node.js App** page. If the Node version or application
directory changes on cPanel's **Setup Node.js App** page, update the paths at
the top of `.cpanel.yml` to match.

A failing task stops the deployment, and cPanel shows each task's output in
the deployment log. The environment sets `NODE_ENV=production`, which would
make npm skip the development dependencies; that's why the install needs
`--include=dev`. npm 11 warns that it skipped some packages' install scripts;
that's expected, because bcrypt ships prebuilt binaries and the other scripts
only matter for tests.

### The log

The server logs one JSON object per line on standard error, which Passenger
appends to `stderr.log` in the application directory. Each request's entries
share a `reqId`, which is also the `X-Request-Id` header, and the reference a
server error shows people. Passwords, tokens, email addresses, phone numbers
and query strings are kept out. Security events have an `event` field:
`sign-in-failed`, `forbidden`, `rate-limited`, `cross-site-request-refused`
and `webhook-refused`. `PQ_LOG_LEVEL` sets the least severe entries kept
(default `info`).

Nothing else empties `stderr.log`, so a daily cron job (cPanel's **Cron Jobs**
page, "Once Per Day") keeps it in bounds with
[apps/api/scripts/rotate-log.sh](apps/api/scripts/rotate-log.sh): past 10 MB,
it keeps a compressed copy and empties the file, keeping 5 copies.

```sh
sh /home/thepuzzlequest/puzzlequest/apps/api/scripts/rotate-log.sh /home/thepuzzlequest/puzzlequest/stderr.log
```

`/healthz` answers 200 while the server can reach its database, and 503 when
it can't.

### Running commands on the site

Some jobs are commands: making an administrator, and checking or restoring a
backup. cPanel's **Terminal** can run them, but two other ways don't need it:

- **From your own computer**, for commands that only touch the database, such
  as `promote`. Clone the repository, run `npm ci` and
  `npm run build --workspace=@puzzlequest/api`, and in Atlas, under
  **Network Access**, add your computer's address (remove it afterwards).
  Then give the site's connection string, from the **Setup Node.js App** page,
  just for the command:

  ```sh
  PQ_MONGODB_URI='CONNECTION_STRING' node apps/api/dist/admin/cli.js promote USER_NAME
  ```

- **As a one-off cron job**, for commands that need the server's files, such
  as checking or restoring a backup. On the **Cron Jobs** page, add a job for
  a minute or two from now (set the minute, hour, day and month, not a
  "Common Setting", so it runs once), whose command starts with the app's
  Node and saves what it says:

  ```sh
  . /home/thepuzzlequest/nodevenv/puzzlequest/24/bin/activate && node /home/thepuzzlequest/puzzlequest/apps/api/dist/backup/cli.js verify /home/thepuzzlequest/backups/NAME >> /home/thepuzzlequest/command-output.txt 2>&1
  ```

  Once it has run, **delete the job**, and read `command-output.txt` in File
  Manager. A job holding a connection string must be deleted promptly.

### Making an administrator

A new site has no administrator: signing up makes a player, however early.
Sign up on the site, then run `promote` with your user name, from your own
computer as above (or in the Terminal):

```sh
node apps/api/dist/admin/cli.js promote USER_NAME
```

It signs that user out, so their next sign-in has the new role. After that,
administrators can make others administrators by editing their profiles.

### Backups

A backup holds what Git doesn't: the database and the uploaded media. The code
is rebuilt from the commit a backup records. Each backup is a folder in
`~/backups`, named by when it was made, holding every collection as
compressed Extended JSON (exact IDs and dates), a copy of `storage/puzzleData`,
and a `manifest.json` of record counts and checksums. Sessions and emailed
links are left out, so after a restore everyone signs in again. The newest 14
backups are kept, and the newest of each of the last 8 weeks. The commands are
in [apps/api/src/backup/cli.ts](apps/api/src/backup/cli.ts).

**Nightly backups aren't turned on yet.** The backups sit on the same server
as the app, which protects against mistakes, such as a bad migration or a
wrong deletion, but not against losing the host: download one now and then
(compress its folder in File Manager, then download it). To turn them on:

1. In Atlas, under **Database Access**, add a database user for backups with
   the built-in role **Only read any database**, so a leaked backup
   credential can't change anything.
2. In your home folder, create `.puzzlequest-backup.env`, readable only by
   you (`chmod 600`), holding that user's connection string, for the same
   database as the site's:

   ```sh
   PQ_MONGODB_URI=mongodb+srv://backup:PASSWORD@CLUSTER/DATABASE?retryWrites=true&w=majority
   ```

3. Add a daily cron job ("Once Per Day"; early morning is quietest). It says
   nothing when it works, so cron only reports failures:

   ```sh
   . /home/thepuzzlequest/nodevenv/puzzlequest/24/bin/activate && node --env-file=/home/thepuzzlequest/.puzzlequest-backup.env /home/thepuzzlequest/puzzlequest/apps/api/dist/backup/cli.js backup
   ```

4. The next day, check a backup is whole, with the `verify` command, as a
   one-off cron job (see "Running commands on the site"). It writes
   "Whole: …", or what's wrong.

**Restoring.** A restore replaces the database's collections and the media
with a backup's, rebuilds the indexes, and checks the result against the
manifest. It needs the server's files and a user that can write, so run it as
a one-off cron job (see "Running commands on the site") with the site's own
connection string, from the **Setup Node.js App** page:

1. Check the backup, with `verify`, as a one-off job.
2. Restore it, as a one-off job, confirming the database's name, since it
   replaces what's there; then delete the job at once, since it holds the
   connection string:

   ```sh
   . /home/thepuzzlequest/nodevenv/puzzlequest/24/bin/activate && PQ_MONGODB_URI='CONNECTION_STRING' node /home/thepuzzlequest/puzzlequest/apps/api/dist/backup/cli.js restore /home/thepuzzlequest/backups/NAME --confirm DATABASE >> /home/thepuzzlequest/command-output.txt 2>&1
   ```

3. The command says which commit made the backup. If the code has changed the
   data's shape since then, deploy that commit, or run the later migrations
   on the restored data.
4. Restart the app, with **Restart** on the **Setup Node.js App** page.

**Practice.** To check a backup restores, without touching production,
restore a downloaded copy into a local database and folder:

```sh
npm run build --workspace=@puzzlequest/api
PQ_MONGODB_URI=mongodb://localhost:27017/puzzlequest-drill node apps/api/dist/backup/cli.js restore ~/Downloads/NAME --media /tmp/puzzlequest-drill-media
```

### The service worker

Built copies of the web app register a service worker (`/sw.js`, from
[apps/web/src/serviceWorker/sw.ts](apps/web/src/serviceWorker/sw.ts)), which
answers repeat visits from a copy of the app's page and built files kept in the
browser, so pages open at once. Each visit refreshes the copy, so a deployment
reaches a browser on its next page load after the one that fetched it. The API,
signing out, uploaded media, the server's own files, the emailed-link pages and
the administrators' screens always come from the server. Which requests it
answers is decided in
[apps/web/src/serviceWorker/routing.ts](apps/web/src/serviceWorker/routing.ts).

To turn it off for everyone, make `sw.ts` unregister itself and delete what it
kept, deploy, and leave that in place for a while, since browsers keep using an
installed worker until they fetch the new `sw.js`:

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        await caches.delete(name);
      }
      await self.registration.unregister();
    })()
  );
});
```

Also remove `registerServiceWorker()` from
[apps/web/src/main.tsx](apps/web/src/main.tsx), so browsers don't install it again.

## Continuous integration

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on
every pull request and on every push to `main`:

- **Lint and test:** installs with `npm ci --engine-strict` on the Node
  version in `.nvmrc`, then runs `npm run lint`, `npm run typecheck`,
  `npm run build`, the web app's size budget, `npm run format:check`, and the tests, and checks that the API client's generated files match the routes; a separate job runs the browser tests. The strict engine check fails the build if any dependency no
  longer supports that Node version.
- **Dependency audit:** fails on any advisory of moderate severity or higher
  in the production dependencies (`npm audit --omit=dev`). Advisories that
  affect only development tools, such as linters and test runners, are
  reported in the job's log but don't fail the build.

Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) opens weekly
update PRs for npm packages and GitHub Actions. Minor and patch npm updates
are grouped into one PR. Each major update gets its own PR.
