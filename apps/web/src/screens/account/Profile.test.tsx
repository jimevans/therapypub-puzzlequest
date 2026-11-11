import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { ok, refusal, signedOut } from "../../test/fakes";
import { EditProfile } from "./EditProfile";
import { Profile } from "./Profile";
import { SignUp } from "./SignUp";
import { formatPhone } from "./accountForm";

const PLAYER = {
  id: "1",
  userName: "player",
  displayName: "The Player",
  email: "player@example.com",
  emailVerified: true,
  phone: "+13125550142",
  sms: false,
  role: "player",
  teams: [{ teamName: "red", displayName: "The Reds" }],
};
const ADMIN = {
  ...PLAYER,
  id: "2",
  userName: "boss",
  displayName: "The Boss",
  role: "admin",
};

/** Has the API create the account, then answer signing in as it. */
function apiSignsUp(signIn: unknown = ok({ user: PLAYER }, 201)) {
  return vi
    .spyOn(api, "POST")
    .mockImplementation((async (path: string) =>
      path === "/users" ? ok(PLAYER, 201) : signIn) as never);
}

const assign = vi.fn();

/** Has the API answer as the given viewer, about the given user. */
function apiKnows(
  viewer: unknown,
  user: unknown = PLAYER,
  teams: unknown[] = []
) {
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    if (path === "/sessions/current") {
      return viewer ? ok({ user: viewer }) : signedOut();
    }
    if (path === "/teams") {
      return ok({ items: teams, next: null });
    }
    return user ? ok(user) : refusal("not-found", "No such user");
  }) as never);
}

function show(path: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/user/register" element={<SignUp />} />
          <Route path="/user/:userName" element={<Profile />} />
          <Route path="/user/:userName/edit" element={<EditProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { ...location, assign });
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("formatPhone", () => {
  it("makes a stored number readable", () => {
    expect(formatPhone("+13125550142")).toBe("(312) 555-0142");
  });

  it("leaves anything else as it is", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("+442071838750")).toBe("+442071838750");
  });
});

describe("signing up", () => {
  async function fillIn(
    password = "a long enough password",
    confirm = password
  ) {
    await userEvent.type(await screen.findByLabelText("User name"), "newbie");
    await userEvent.type(screen.getByLabelText("Password"), password);
    await userEvent.type(screen.getByLabelText("Confirm password"), confirm);
    await userEvent.type(screen.getByLabelText("Display name"), "Newbie");
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
  }

  const submit = () =>
    userEvent.click(
      screen.getByRole("button", { name: /^(Sign up|Create user)$/ })
    );

  it("creates the account, signs in, and goes home", async () => {
    apiKnows(null);
    const post = apiSignsUp();
    show("/user/register");

    await fillIn();
    await submit();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(post).toHaveBeenNthCalledWith(1, "/users", {
      body: expect.objectContaining({
        userName: "newbie",
        email: "new@example.com",
        sms: false,
      }),
    });
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("body.role");
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("body.confirmPassword");
    expect(post).toHaveBeenNthCalledWith(2, "/sessions", {
      body: { userName: "newbie", password: "a long enough password" },
    });
  });

  it("goes on to the page they wanted, but only on this site", async () => {
    apiKnows(null);
    apiSignsUp();
    show(`/user/register?next=${encodeURIComponent("//evil.example")}`);

    await fillIn();
    await submit();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("sends them to sign in if signing in fails, as the account exists", async () => {
    apiKnows(null);
    apiSignsUp(refusal("too-many-requests", "Slow down"));
    show(`/user/register?next=${encodeURIComponent("/quest/trail")}`);

    await fillIn();
    await submit();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent("/quest/trail")}`
      )
    );
  });

  it("refuses passwords that are short or don't match", async () => {
    apiKnows(null);
    const post = vi.spyOn(api, "POST");
    show("/user/register");

    await fillIn("short", "other");
    await submit();

    expect(
      await screen.findByText("Must be at least 8 characters long")
    ).toBeVisible();
    expect(screen.getByText("The passwords don't match")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's complaint beside the field it's about", async () => {
    apiKnows(null);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal("invalid-request", "Invalid", [
        { path: "body.phone", message: "Enter a valid phone number" },
      ]) as never
    );
    show("/user/register");

    await fillIn();
    await submit();

    expect(await screen.findByText("Enter a valid phone number")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("says why it was refused otherwise", async () => {
    apiKnows(null);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal("already-exists", "That user name is already in use") as never
    );
    show("/user/register");

    await fillIn();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That user name is already in use"
    );
  });

  it("keeps SMS unchecked by default, and keeps the consent wording", async () => {
    apiKnows(null);
    show("/user/register");

    expect(
      await screen.findByLabelText("Allow sending of SMS messages")
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "More info" }));

    const consent = document.querySelector("#more-info");
    expect(consent?.textContent?.replace(/\s+/g, " ")).toBe(
      'Checking this box gives The PuzzleQuest Game consent to send you mobile text (SMS) messages. These messages will come from The PuzzleQuest Game number (813-296-5411). The PuzzleQuest Game does not charge for these services, but messaging and data rates from your mobile provider may apply. You may opt out of receiving the messages at any time by replying "STOP", or by unchecking this checkbox. See our Privacy Policy for full details.'
    );
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/policies/privacy.html");
  });

  it("offers no authorization level to someone signing up", async () => {
    apiKnows(null);
    show("/user/register");

    await screen.findByLabelText("User name");
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
  });

  it("tells a signed-in player to sign out first", async () => {
    apiKnows(PLAYER);
    show("/user/register");

    expect(
      await screen.findByRole("heading", { name: "You're already signed in" })
    ).toBeVisible();
    expect(screen.queryByLabelText("User name")).not.toBeInTheDocument();
  });

  describe("by an administrator", () => {
    it("creates the user with a role, without signing in as them", async () => {
      apiKnows(ADMIN);
      const post = apiSignsUp();
      show("/user/register");

      expect(
        await screen.findByRole("heading", { name: "Create a user" })
      ).toBeVisible();
      await fillIn();
      await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
      await submit();

      await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith("/users", {
        body: expect.objectContaining({ role: "admin" }),
      });
    });
  });
});

describe("a profile", () => {
  it("shows the user's details", async () => {
    apiKnows(PLAYER);
    show("/user/player");

    expect(await screen.findByText("player@example.com")).toBeVisible();
    expect(screen.getByText("(312) 555-0142")).toBeVisible();
    expect(screen.getByText("Not allowed")).toBeVisible();
  });

  it("says when the address isn't verified, with a reminder for its owner", async () => {
    apiKnows(
      { ...PLAYER, emailVerified: false },
      { ...PLAYER, emailVerified: false }
    );
    show("/user/player");

    expect(
      await screen.findByText("player@example.com (not verified)")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send it again" })).toBeVisible();
  });

  it("offers a player no administrator's controls", async () => {
    apiKnows(PLAYER);
    show("/user/player");

    await screen.findByRole("heading", { name: "The Player", level: 1 });
    expect(screen.queryByText("Role")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send password reset email" })
    ).not.toBeInTheDocument();
  });

  it("shows an administrator another user's level, and can send a reset link", async () => {
    apiKnows(ADMIN);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(undefined, 204) as never);
    show("/user/player");

    expect(await screen.findByText("Player")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Change password" })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Send password reset email" })
    );

    expect(
      await screen.findByText(
        "Password reset email sent to player@example.com."
      )
    ).toBeVisible();
    expect(post).toHaveBeenCalledWith(
      "/users/{userName}/password-reset-links",
      {
        params: { path: { userName: "player" } },
      }
    );
  });

  it("says when there's no such user", async () => {
    apiKnows(ADMIN, null);
    show("/user/nobody");

    expect(
      await screen.findByRole("heading", { name: "User not found" })
    ).toBeVisible();
  });

  describe("changing a password", () => {
    async function change(current: string, next: string, confirm = next) {
      await userEvent.type(
        await screen.findByLabelText("Current password"),
        current
      );
      await userEvent.type(screen.getByLabelText("New password"), next);
      await userEvent.type(
        screen.getByLabelText("Confirm new password"),
        confirm
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Change password" })
      );
    }

    it("sends both passwords, says so, and clears the form", async () => {
      apiKnows(PLAYER);
      const put = vi
        .spyOn(api, "PUT")
        .mockResolvedValue(ok(undefined, 204) as never);
      show("/user/player");

      await change("the old password", "the new password");

      expect(await screen.findByText(/has been changed/)).toBeVisible();
      expect(put).toHaveBeenCalledWith("/users/{userName}/password", {
        params: { path: { userName: "player" } },
        body: {
          currentPassword: "the old password",
          newPassword: "the new password",
        },
      });
      expect(screen.getByLabelText("Current password")).toHaveValue("");
    });

    it("says when the current password is wrong", async () => {
      apiKnows(PLAYER);
      vi.spyOn(api, "PUT").mockResolvedValue(
        refusal("incorrect-password", "Incorrect password") as never
      );
      show("/user/player");

      await change("wrong", "the new password");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Incorrect password"
      );
    });

    it("refuses new passwords that are short or don't match", async () => {
      apiKnows(PLAYER);
      const put = vi.spyOn(api, "PUT");
      show("/user/player");

      await change("the old password", "short", "other");

      expect(
        await screen.findByText("Must be at least 8 characters long")
      ).toBeVisible();
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("teams", () => {
    const BLUE = { teamName: "blue", displayName: "The Blues" };
    const RED = { teamName: "red", displayName: "The Reds" };

    it("joins a team by its code alone, saying which it was", async () => {
      apiKnows(PLAYER, PLAYER, [RED, BLUE]);
      const get = vi.mocked(api.GET);
      const post = vi
        .spyOn(api, "POST")
        .mockResolvedValue(ok(BLUE, 201) as never);
      show("/user/player");

      await userEvent.click(
        await screen.findByRole("button", { name: "Join a team" })
      );
      // No list of teams to choose from, and none fetched.
      expect(screen.queryByLabelText("Team")).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Join code"), "secret");
      await userEvent.click(screen.getByRole("button", { name: "Join team" }));

      expect(await screen.findByText("You joined The Blues.")).toBeVisible();
      expect(post).toHaveBeenCalledWith("/users/{userName}/teams", {
        params: { path: { userName: "player" } },
        body: { joinCode: "secret" },
      });
      expect(get).not.toHaveBeenCalledWith("/teams", expect.anything());
    });

    it("says when no team has the code, and stays open", async () => {
      apiKnows(PLAYER, PLAYER, [BLUE]);
      vi.spyOn(api, "POST").mockResolvedValue(
        refusal("wrong-join-code", "No team has that join code") as never
      );
      show("/user/player");

      await userEvent.click(
        await screen.findByRole("button", { name: "Join a team" })
      );
      await userEvent.type(screen.getByLabelText("Join code"), "wrong");
      await userEvent.click(screen.getByRole("button", { name: "Join team" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No team has that join code"
      );
      expect(screen.getByLabelText("Join code")).toBeVisible();
    });

    it("needs a join code", async () => {
      apiKnows(PLAYER, PLAYER, [BLUE]);
      const post = vi.spyOn(api, "POST");
      show("/user/player");

      await userEvent.click(
        await screen.findByRole("button", { name: "Join a team" })
      );
      await userEvent.click(screen.getByRole("button", { name: "Join team" }));

      expect(
        await screen.findByText("Enter the team's join code")
      ).toBeVisible();
      expect(post).not.toHaveBeenCalled();
    });

    it("asks before leaving a team", async () => {
      apiKnows(PLAYER);
      const del = vi
        .spyOn(api, "DELETE")
        .mockResolvedValue(ok(undefined, 204) as never);
      show("/user/player");

      await userEvent.click(
        await screen.findByRole("button", { name: "Leave" })
      );
      expect(del).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Stay" }));
      expect(del).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Leave" }));
      await userEvent.click(screen.getByRole("button", { name: "Leave team" }));

      await waitFor(() =>
        expect(del).toHaveBeenCalledWith(
          "/teams/{teamName}/members/{userName}",
          {
            params: { path: { teamName: "red", userName: "player" } },
          }
        )
      );
    });
  });

  describe("deleting an account", () => {
    async function openDeletion() {
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete my account" })
      );
      return within(
        screen.getByRole("dialog", { name: "Delete your account?" })
      );
    }

    it("is offered only to the account's own user", async () => {
      apiKnows(ADMIN, PLAYER);
      show("/user/player");

      await screen.findByText("player@example.com");
      expect(
        screen.queryByRole("button", { name: "Delete my account" })
      ).not.toBeInTheDocument();
    });

    it("explains what it means, and needs the password", async () => {
      apiKnows(PLAYER);
      const del = vi.spyOn(api, "DELETE");
      show("/user/player");

      const dialog = await openDeletion();
      expect(dialog.getByText(/can't be undone/)).toBeVisible();
      await userEvent.click(
        dialog.getByRole("button", { name: "Delete my account" })
      );

      expect(await dialog.findByText("Enter your password")).toBeVisible();
      expect(del).not.toHaveBeenCalled();
    });

    it("says when the password is wrong, keeping the account", async () => {
      apiKnows(PLAYER);
      vi.spyOn(api, "DELETE").mockResolvedValue(
        refusal("incorrect-password", "That isn't your password") as never
      );
      show("/user/player");

      const dialog = await openDeletion();
      await userEvent.type(dialog.getByLabelText("Your password"), "wrong");
      await userEvent.click(
        dialog.getByRole("button", { name: "Delete my account" })
      );

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "That isn't your password"
      );
      expect(assign).not.toHaveBeenCalled();
    });

    it("deletes it with the password, and starts afresh signed out", async () => {
      apiKnows(PLAYER);
      const del = vi
        .spyOn(api, "DELETE")
        .mockResolvedValue(ok(undefined, 204) as never);
      show("/user/player");

      const dialog = await openDeletion();
      await userEvent.type(dialog.getByLabelText("Your password"), "secret");
      await userEvent.click(
        dialog.getByRole("button", { name: "Delete my account" })
      );

      await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
      expect(del).toHaveBeenCalledWith("/users/{userName}", {
        params: { path: { userName: "player" } },
        body: { password: "secret" },
      });
    });

    it("can be called off", async () => {
      apiKnows(PLAYER);
      const del = vi.spyOn(api, "DELETE");
      show("/user/player");

      const dialog = await openDeletion();
      await userEvent.click(
        dialog.getByRole("button", { name: "Keep my account" })
      );

      expect(
        screen.queryByRole("dialog", { name: "Delete your account?" })
      ).not.toBeInTheDocument();
      expect(del).not.toHaveBeenCalled();
    });
  });
});

describe("editing a profile", () => {
  it("starts with the current details, with the phone number readable", async () => {
    apiKnows(PLAYER);
    show("/user/player/edit");

    expect(await screen.findByLabelText("Display name")).toHaveValue(
      "The Player"
    );
    expect(screen.getByLabelText("Phone number")).toHaveValue("(312) 555-0142");
    expect(
      screen.getByText(
        "Changing it sends a link to the new address to verify it."
      )
    ).toBeVisible();
  });

  it("saves the changes, without a level for a player, and returns", async () => {
    apiKnows(PLAYER);
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(PLAYER) as never);
    show("/user/player/edit");

    const name = await screen.findByLabelText("Display name");
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("heading", { name: "The Player", level: 1 })
    ).toBeVisible();
    expect(patch).toHaveBeenCalledWith("/users/{userName}", {
      params: { path: { userName: "player" } },
      body: {
        displayName: "Renamed",
        email: "player@example.com",
        phone: "(312) 555-0142",
        sms: false,
      },
    });
  });

  it("lets an administrator change the role", async () => {
    apiKnows(ADMIN);
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(PLAYER) as never);
    show("/user/player/edit");

    await userEvent.selectOptions(
      await screen.findByLabelText("Role"),
      "admin"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/users/{userName}", {
        params: { path: { userName: "player" } },
        body: expect.objectContaining({ role: "admin" }),
      })
    );
  });

  it("shows the server's complaint beside the field", async () => {
    apiKnows(PLAYER);
    vi.spyOn(api, "PATCH").mockResolvedValue(
      refusal("invalid-request", "Invalid", [
        { path: "body.email", message: "Enter a valid email address" },
      ]) as never
    );
    show("/user/player/edit");

    await screen.findByLabelText("Email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Enter a valid email address")
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when there's no such user", async () => {
    apiKnows(ADMIN, null);
    show("/user/nobody/edit");

    expect(
      await screen.findByRole("heading", { name: "User not found" })
    ).toBeVisible();
  });
});
