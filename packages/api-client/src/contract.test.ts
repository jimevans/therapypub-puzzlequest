import { describe, expect, it } from "vitest";
import description from "../openapi.json" with { type: "json" };
import { createContract } from "./contract.js";

const contract = createContract(description);

const problem = {
  type: "/problems/not-found",
  title: "Not found",
  status: 404,
  detail: "No such team",
};

describe("the API's contract", () => {
  it("finds a request's path, preferring literal segments", () => {
    expect(contract.pathOf("/sessions/current")).toBe("/sessions/current");
    expect(contract.pathOf("/users/alice/teams")).toBe(
      "/users/{userName}/teams"
    );
    expect(contract.pathOf("/nowhere")).toBeUndefined();
  });

  it("knows which operations it has", () => {
    expect(contract.has("GET", "/teams")).toBe(true);
    expect(contract.has("PUT", "/teams")).toBe(false);
  });

  it("accepts an answer that matches", () => {
    expect(
      contract.check({
        method: "get",
        path: "/teams/{teamName}",
        status: 404,
        mediaType: "application/problem+json",
        body: problem,
      })
    ).toBeUndefined();
  });

  it("says what part of a body doesn't match", () => {
    expect(
      contract.check({
        method: "GET",
        path: "/teams/{teamName}",
        status: 404,
        mediaType: "application/problem+json",
        body: { ...problem, status: "404" },
      })
    ).toBe(
      "GET /teams/{teamName} 404 doesn't match its description: /status must be integer"
    );
  });

  it("refuses a problem of a type the response doesn't list", () => {
    expect(
      contract.check({
        method: "GET",
        path: "/teams/{teamName}",
        status: 404,
        mediaType: "application/problem+json",
        body: { ...problem, type: "/problems/gone-fishing" },
      })
    ).toBe(
      "GET /teams/{teamName} 404 is a problem of type /problems/gone-fishing, where its description lists /problems/not-found"
    );
    expect(
      contract.check({
        method: "GET",
        path: "/teams/{teamName}",
        status: 404,
        mediaType: "application/problem+json",
        body: { ...problem, type: "about:blank" },
      })
    ).toBeUndefined();
  });

  it("refuses a status the operation doesn't list", () => {
    expect(
      contract.check({
        method: "GET",
        path: "/teams/{teamName}",
        status: 418,
        mediaType: "application/json",
        body: {},
      })
    ).toMatch(
      /^GET \/teams\/\{teamName\} answered 418, which its description doesn't list/
    );
  });

  it("refuses an operation it doesn't have", () => {
    expect(contract.check({ method: "PUT", path: "/teams", status: 200 })).toBe(
      "PUT /teams isn't in the API's description"
    );
  });

  it("refuses a body where there should be none, or the wrong media type", () => {
    expect(
      contract.check({
        method: "DELETE",
        path: "/teams/{teamName}",
        status: 204,
      })
    ).toBeUndefined();
    expect(
      contract.check({
        method: "DELETE",
        path: "/teams/{teamName}",
        status: 204,
        body: {},
      })
    ).toBe(
      "DELETE /teams/{teamName} 204 has a body, where its description has none"
    );
    expect(
      contract.check({
        method: "GET",
        path: "/teams/{teamName}",
        status: 404,
        mediaType: "text/html",
        body: "<p>Not found</p>",
      })
    ).toBe(
      "GET /teams/{teamName} 404 was sent as text/html, where its description says application/problem+json"
    );
  });

  it("checks only the media type of a picture", () => {
    expect(
      contract.check({
        method: "GET",
        path: "/quests/{name}/puzzles/{puzzleName}/qr-code",
        status: 200,
        mediaType: "image/png",
      })
    ).toBeUndefined();
  });

  it("lists every response it describes", () => {
    expect(contract.responses()).toContain("DELETE /sessions/current 204");
  });
});
