# Decisions

Why PuzzleQuest is built the way it is: one short record per significant
decision (see [0001](0001-record-decisions.md)). Read the relevant one before
reopening a question; add one when a change settles a question others will
ask.

- [0001. Record decisions](0001-record-decisions.md)
- [0002. TypeScript, strict, compiled by TypeScript 7](0002-typescript.md)
- [0003. One repository, with npm workspaces](0003-npm-workspaces.md)
- [0004. Sessions in the database, not JWTs](0004-database-sessions.md)
- [0005. The API first, described by its own code](0005-api-first.md)
- [0006. Names in URLs, IDs inside, ready for organizations](0006-names-in-urls-ids-inside.md)
- [0007. The game's rules as pure functions](0007-game-rules-as-pure-functions.md)
- [0008. React for the web front end](0008-react.md)
- [0009. The React app's libraries](0009-react-stack.md)
- [0010. The web app uses only the public API](0010-public-api-only.md)
- [0011. Players never learn how long a quest is](0011-quest-length-stays-hidden.md)
- [0012. A strict Content Security Policy](0012-strict-content-security-policy.md)
- [0013. Browser tests with WebdriverIO over WebDriver BiDi](0013-browser-tests-webdriverio-bidi.md)
- [0014. Contract tests on both sides of the API](0014-contract-tests.md)
- [0015. A hand-written service worker](0015-hand-written-service-worker.md)
- [0016. Structured logs on standard error](0016-logging.md)
- [0017. Our own backups, ready but not active](0017-backups.md)
- [0018. Deploys build on the host](0018-deploy-by-building-on-the-host.md)

To add one, copy the shape of an existing record (status, date, context,
decision, consequences, alternatives), number it next, and add it here. A
reversed decision keeps its record, marked **superseded by** the new one.
