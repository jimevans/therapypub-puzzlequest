// The check of faked API answers that runs after every test (setup.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { fakedAnswerMismatches } from "./contract";
import { aUser, ok, refusal } from "./fakes";

describe("the check of faked API answers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes answers the API could give", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(ok({ user: aUser() }) as never);
    await api.GET("/sessions/current");

    expect(fakedAnswerMismatches()).toEqual([]);
  });

  it("catches an answer the API couldn't give, even once restored", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({ user: { userName: "player" } }) as never
    );
    await api.GET("/sessions/current");
    vi.restoreAllMocks();

    expect(fakedAnswerMismatches()).toEqual([
      expect.stringMatching(
        /^GET \/sessions\/current 200 doesn't match its description: \/user must have required property 'id'/
      ),
    ]);
  });

  it("catches a problem of a type the route doesn't give", async () => {
    vi.spyOn(api, "DELETE").mockResolvedValue(
      refusal("wrong-answer", "Not the answer") as never
    );
    await api.DELETE("/teams/{teamName}", {
      params: { path: { teamName: "red" } },
    });

    expect(fakedAnswerMismatches()).toEqual([
      expect.stringMatching(
        /^DELETE \/teams\/\{teamName\} answered 422, which its description doesn't list/
      ),
    ]);
  });

  it("ignores a request that never reached the server", async () => {
    vi.spyOn(api, "GET").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.GET("/sessions/current")).rejects.toThrow();

    expect(fakedAnswerMismatches()).toEqual([]);
  });

  it("knows each fake's problem type by its status", () => {
    expect(refusal("not-found").response.status).toBe(404);
    expect(() => refusal("gone-fishing")).toThrow(
      "The API has no problem of type /problems/gone-fishing"
    );
  });
});
