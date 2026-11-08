import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { aUser, ok, refusal } from "../../test/fakes";
import { SignIn } from "./SignIn";
import { pathAfterSignIn } from "./pathAfterSignIn";

const assign = vi.fn();

function show(path = "/login") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <SignIn />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function apiAnswers(answer: unknown) {
  return vi.spyOn(api, "POST").mockResolvedValue(answer as never);
}

async function fillIn() {
  await userEvent.type(screen.getByLabelText("User name"), "player");
  await userEvent.type(screen.getByLabelText("Password"), "secret words");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignIn", () => {
  beforeEach(() => {
    assign.mockClear();
    vi.stubGlobal("location", { ...location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("signs in, and goes home", async () => {
    const post = apiAnswers(ok({ user: aUser() }, 201));
    show();

    await fillIn();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(post).toHaveBeenCalledWith("/sessions", {
      body: { userName: "player", password: "secret words" },
    });
  });

  it("returns to the page that asked for sign-in", async () => {
    apiAnswers(ok({ user: aUser() }, 201));
    show(`/login?next=${encodeURIComponent("/quest/trail?view=all")}`);

    await fillIn();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/quest/trail?view=all")
    );
  });

  it("says why the API refused, and stays", async () => {
    apiAnswers(refusal("sign-in-failed", "Incorrect user name or password"));
    show();

    await fillIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect user name or password"
    );
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("says when the server can't be reached", async () => {
    vi.spyOn(api, "POST").mockRejectedValue(new TypeError("Failed to fetch"));
    show();

    await fillIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server"
    );
  });

  it("asks for what's missing, without calling the API", async () => {
    const post = apiAnswers(ok({ user: aUser() }, 201));
    show();

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your user name")).toBeVisible();
    expect(screen.getByText("Enter your password")).toBeVisible();
    expect(screen.getByLabelText("User name")).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });

  it("offers a way to recover a password or create an account", () => {
    show();

    expect(
      screen.getByRole("link", { name: "Forgot password?" })
    ).toHaveAttribute("href", "/user/password/forgot");
    expect(
      screen.getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/user/register");
  });
});

describe("pathAfterSignIn", () => {
  it.each([
    ["/quest/trail", "/quest/trail"],
    ["/quest/trail?a=1#b", "/quest/trail?a=1#b"],
    ["/", "/"],
  ])("keeps a path on this site: %s", (next, expected) => {
    expect(pathAfterSignIn(next)).toBe(expected);
  });

  it.each([
    [null],
    [""],
    ["//example.com"],
    ["/\\example.com"],
    ["https://example.com"],
    ["javascript:alert(1)"],
    ["quest/trail"],
  ])("goes home instead of to anywhere else: %s", (next) => {
    expect(pathAfterSignIn(next)).toBe("/");
  });
});
