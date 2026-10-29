import { vi } from "vitest";

// bcrypt is a native module whose build script may not have run, and
// jsonwebtoken's dependency chain (buffer-equal-constant-time) cannot load on
// Node 25+. Unit tests do not exercise either, so stub them globally.
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(async () => "hashed"), compare: vi.fn(async () => false) },
}));
vi.mock("jsonwebtoken", () => ({
  default: { sign: vi.fn(() => "token"), verify: vi.fn() },
}));
