import path from "node:path";

/**
 * Runs a command module's command when Node started that module as a
 * script, and not when something imports it, such as a test. Its exit code
 * becomes the process's; an error is written out, with exit code 1.
 * @param moduleFile the module's file (import.meta.filename)
 * @param run the command, given the arguments after the script
 * @param argv the process's arguments; process.argv by default
 */
export async function runIfStarted(
  moduleFile: string,
  run: (args: string[]) => Promise<number>,
  argv: string[] = process.argv
): Promise<void> {
  if (!argv[1] || moduleFile !== path.resolve(argv[1])) {
    return;
  }
  try {
    process.exitCode = await run(argv.slice(2));
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  }
}
