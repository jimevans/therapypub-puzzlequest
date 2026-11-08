# 0017. Our own backups, ready but not active

- **Status:** accepted
- **Date:** 2026-11-08

## Context

Production is on MongoDB Atlas's free tier, which takes no backups, and the
host's own backups are off. Spending on operations isn't possible yet.
Uploaded media is on the host, not in the database.

## Decision

Backup, verify, and restore commands (`apps/api/src/backup/`): a backup is a
folder of each collection as compressed Extended JSON, a copy of the media,
and a manifest of counts, checksums, and the deployed commit. Retention is
the newest 14 and the newest of each of the last 8 weeks. The README says how
to turn nightly backups on, with a read-only database user and a cron job;
they aren't on yet, a risk the owner has accepted.

## Consequences

- Backups sit on the same host as the site: they protect against mistakes,
  not against losing the host, unless copies are downloaded.
- Restores run as one-off cron jobs, since the server's terminal is hard to
  use.

## Alternatives considered

- **Atlas's backup add-on or Flex tier:** a few dollars a month; declined for
  now, and they wouldn't cover media.
