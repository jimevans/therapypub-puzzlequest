import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { sendErrorPage } from "../src/errorPage.js";

function capture() {
  const res = {
    status: vi.fn((_status: number) => res),
    type: vi.fn((_type: string) => res),
    send: vi.fn((_body: string) => res),
  };
  return res;
}

describe("the error page", () => {
  it("says what went wrong, with the status given", () => {
    const res = capture();

    sendErrorPage(res as unknown as Response, 403, "Forbidden", "Not for you");

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.type).toHaveBeenCalledWith("html");
    const page = res.send.mock.calls[0]?.[0] ?? "";
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain("<title>Forbidden · PuzzleQuest</title>");
    expect(page).toContain("<h1>Forbidden</h1>");
    expect(page).toContain("<p>Not for you</p>");
  });

  it("shows what it's given as text, never as markup", () => {
    const res = capture();

    sendErrorPage(
      res as unknown as Response,
      403,
      "<b>Bold</b>",
      `User <script>alert("x")</script> & 'friends'`
    );

    const page = res.send.mock.calls[0]?.[0] ?? "";
    expect(page).not.toContain("<script>");
    expect(page).not.toContain("<b>");
    expect(page).toContain(
      "User &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;"
    );
  });
});
