// The backup commands, run from the deployed server code with Node:
//
//   node dist/backup/cli.js backup [--to FOLDER] [--media FOLDER]
//   node dist/backup/cli.js verify BACKUP
//   node dist/backup/cli.js restore BACKUP [--media FOLDER] [--confirm DATABASE]
//
// The database comes from PQ_MONGODB_URI, as for the server; the media is
// the server's uploaded media unless --media says otherwise; backups go in
// ~/backups unless --to says otherwise. A backup says nothing when it works,
// so a cron job only reports failures. See the README for turning nightly
// backups on, and for restoring.
import { homedir } from "node:os";
import path from "node:path";
import { readdir, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import mongoose from "mongoose";
import { runIfStarted } from "../command.js";
import { config } from "../config.js";
import { puzzleDataDirectory } from "../paths.js";
import { runningCommit } from "../version.js";
import {
  createBackup,
  readManifest,
  restoreBackup,
  verifyBackup,
} from "./backup.js";
import { backupsToRemove } from "./retention.js";

const USAGE = `Usage:
  backup [--to FOLDER] [--media FOLDER]
  verify BACKUP
  restore BACKUP [--media FOLDER] [--confirm DATABASE]`;

/**
 * Writes a line for whoever runs the command.
 * @param line the line
 */
function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Runs a command.
 * @param args the command line, after the script
 * @returns the exit code
 */
export async function run(args: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      to: { type: "string" },
      media: { type: "string" },
      confirm: { type: "string" },
    },
  });
  const [command, backup] = positionals;
  const mediaDirectory = path.resolve(values.media ?? puzzleDataDirectory);

  if (command === "verify" && backup) {
    const problems = await verifyBackup(backup);
    if (problems.length > 0) {
      process.stderr.write(`${problems.join("\n")}\n`);
      return 1;
    }
    const manifest = await readManifest(backup);
    say(
      `Whole: ${Object.keys(manifest.collections).length} collections and ${Object.keys(manifest.media).length} media files, from ${manifest.createdAt} (commit ${manifest.commit})`
    );
    return 0;
  }

  if (command !== "backup" && !(command === "restore" && backup)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  await mongoose.connect(config.PQ_MONGODB_URI);
  try {
    if (command === "backup") {
      const backupsDirectory = path.resolve(
        values.to ?? path.join(homedir(), "backups")
      );
      const made = await createBackup({
        db: mongoose.connection.db!,
        mediaDirectory,
        backupsDirectory,
        commit: runningCommit(),
      });
      for (const name of backupsToRemove(
        await readdir(backupsDirectory),
        path.basename(made)
      )) {
        await rm(path.join(backupsDirectory, name), {
          recursive: true,
          force: true,
        });
      }
      return 0;
    }
    const manifest = await restoreBackup({
      backup: backup!,
      connection: mongoose.connection,
      mediaDirectory,
      confirm: values.confirm,
    });
    say(
      `Restored ${manifest.createdAt}'s backup into ${mongoose.connection.db!.databaseName}, and checked it. It was made by commit ${manifest.commit}: deploy that commit, or a later one whose migrations have been run on this data.`
    );
    return 0;
  } finally {
    await mongoose.connection.close();
  }
}

await runIfStarted(import.meta.filename, run);
