import { vi } from "vitest";

// bcrypt is a native module whose build script may not have run, and it is
// slow by design; tests don't exercise it, so stub it globally.
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
    compare: vi.fn(async () => false),
  },
}));
