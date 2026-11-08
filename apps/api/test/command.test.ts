// Running a command module only when Node started it as a script.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIfStarted } from "../src/command.js";

const FILE = "/app/dist/tool.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("running a command module", () => {
  it("does nothing when the module was imported, not started", async () => {
    const run = vi.fn(async () => 0);

    await runIfStarted(FILE, run, ["node", "/app/dist/other.js"]);
    await runIfStarted(FILE, run, ["node"]);

    expect(run).not.toHaveBeenCalled();
  });

  it("runs the command with its arguments, and exits with its code", async () => {
    const run = vi.fn(async () => 2);

    await runIfStarted(FILE, run, ["node", FILE, "promote", "pat"]);

    expect(run).toHaveBeenCalledWith(["promote", "pat"]);
    expect(process.exitCode).toBe(2);
  });

  it("writes out an error, and exits with 1", async () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await runIfStarted(FILE, async () => {
      throw new Error("no database");
    }, ["node", FILE]);

    expect(write).toHaveBeenCalledWith("no database\n");
    expect(process.exitCode).toBe(1);
  });
});
