import { describe, expect, it } from "vitest";
import { ApiError, dataOrThrow } from "./api";

describe("dataOrThrow", () => {
  it("returns the data of a successful response", () => {
    const data = { name: "trail" };

    expect(dataOrThrow({ data, response: new Response("{}") })).toBe(data);
  });

  it("throws the problem the API described", () => {
    const problem = {
      type: "/problems/wrong-state",
      title: "Wrong state",
      status: 409,
      detail: "The quest has already started",
    };
    const refuse = () =>
      dataOrThrow({
        error: problem,
        response: new Response("{}", { status: 409 }),
      });

    expect(refuse).toThrow(ApiError);
    expect(refuse).toThrow("The quest has already started");
    expect(refuse).toThrow(expect.objectContaining({ status: 409, problem }));
  });

  it("says what happened when the API described no problem", () => {
    const refuse = () =>
      dataOrThrow({ response: new Response("", { status: 502 }) });

    expect(refuse).toThrow("The API answered 502");
  });
});
