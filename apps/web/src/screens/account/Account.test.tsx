import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { ok, refusal } from "../../test/fakes";
import { ForgotPassword } from "./ForgotPassword";
import { ResetPassword } from "./ResetPassword";
import { VerifyEmail } from "./VerifyEmail";

function WhereAmI() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function show(element: React.ReactNode, path = "/") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        {element}
        <WhereAmI />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function apiAnswers(answer: unknown) {
  return vi.spyOn(api, "POST").mockResolvedValue(answer as never);
}

const REFUSED_LINK = refusal("invalid-link", "This link has expired");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForgotPassword", () => {
  it("asks for the link, without its surrounding spaces", async () => {
    const post = apiAnswers(ok(undefined, 202));
    show(<ForgotPassword />);

    await userEvent.type(
      screen.getByLabelText("User name or email"),
      " player "
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" })
    );

    expect(await screen.findByText(/If an account matches/)).toBeVisible();
    expect(post).toHaveBeenCalledWith("/password-reset-requests", {
      body: { identifier: "player" },
    });
  });

  it("asks for something rather than sending nothing", async () => {
    const post = apiAnswers(ok(undefined, 202));
    show(<ForgotPassword />);

    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" })
    );

    expect(
      await screen.findByText("Enter your user name or email address")
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("says why it was refused, such as too many requests", async () => {
    apiAnswers(refusal("too-many-requests", "Try later"));
    show(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText("User name or email"), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Try later");
  });

  it("says when it can't reach the server", async () => {
    vi.spyOn(api, "POST").mockRejectedValue(new TypeError("Failed to fetch"));
    show(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText("User name or email"), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server"
    );
  });
});

describe("ResetPassword", () => {
  const LINK = "/?token=abc_123-XYZ";

  async function choose(password: string, confirmation = password) {
    await userEvent.type(screen.getByLabelText("New password"), password);
    await userEvent.type(
      screen.getByLabelText("Confirm new password"),
      confirmation
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" })
    );
  }

  it("resets the password with the link's token", async () => {
    const post = apiAnswers(ok(undefined, 204));
    show(<ResetPassword />, LINK);

    await choose("a long enough password");

    expect(await screen.findByText(/has been reset/)).toBeVisible();
    expect(post).toHaveBeenCalledWith("/password-resets", {
      body: {
        resetToken: "abc_123-XYZ",
        newPassword: "a long enough password",
      },
    });
  });

  it("removes the token from the address, and keeps working", async () => {
    apiAnswers(ok(undefined, 204));
    show(<ResetPassword />, LINK);

    await waitFor(() =>
      expect(screen.getByTestId("search")).toBeEmptyDOMElement()
    );
    expect(screen.getByLabelText("New password")).toBeVisible();
  });

  it("refuses a password that's too short", async () => {
    const post = apiAnswers(ok(undefined, 204));
    show(<ResetPassword />, LINK);

    await choose("short");

    expect(
      await screen.findByText("Must be at least 8 characters long")
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses passwords that don't match", async () => {
    const post = apiAnswers(ok(undefined, 204));
    show(<ResetPassword />, LINK);

    await choose("a long enough password", "a different password");

    expect(await screen.findByText("The passwords don't match")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("says when the link has expired", async () => {
    apiAnswers(REFUSED_LINK);
    show(<ResetPassword />, LINK);

    await choose("a long enough password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired"
    );
  });

  it.each([
    ["no token", "/"],
    ["a malformed token", "/?token=%3C/script%3E"],
  ])("says the link is invalid with %s", (_why, path) => {
    show(<ResetPassword />, path);

    expect(screen.getByRole("alert")).toHaveTextContent("link is invalid");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new link" })
    ).toHaveAttribute("href", "/user/password/forgot");
  });
});

describe("VerifyEmail", () => {
  const LINK = "/?token=abc_123";

  it("waits for a press, so that following the link alone does nothing", async () => {
    const post = apiAnswers(ok(undefined, 204));
    show(<VerifyEmail />, LINK);

    await waitFor(() =>
      expect(screen.getByTestId("search")).toBeEmptyDOMElement()
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("verifies the address with the link's token", async () => {
    const post = apiAnswers(ok(undefined, 204));
    show(<VerifyEmail />, LINK);

    await userEvent.click(
      screen.getByRole("button", { name: "Verify my email address" })
    );

    expect(await screen.findByText(/is verified/)).toBeVisible();
    expect(post).toHaveBeenCalledWith("/email-verifications", {
      body: { token: "abc_123" },
    });
  });

  it("says when the link has expired, and lets the player try again", async () => {
    apiAnswers(REFUSED_LINK);
    show(<VerifyEmail />, LINK);
    const button = screen.getByRole("button", {
      name: "Verify my email address",
    });

    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired"
    );
    expect(button).toBeEnabled();
  });

  it("says the link is invalid without a token", () => {
    show(<VerifyEmail />);

    expect(screen.getByRole("alert")).toHaveTextContent("link is invalid");
    expect(
      screen.queryByRole("button", { name: "Verify my email address" })
    ).not.toBeInTheDocument();
  });
});
