// Verifying an email address and resetting a forgotten password, from the
// links the server emails.
import {
  ADMIN,
  PASSWORD,
  api,
  emailedLink,
  signIn,
  unique,
} from "../support.js";

describe("an administrator creating a user", () => {
  it("stays signed in as themselves", async () => {
    const created = `made-${unique("").slice(1)}`;
    await signIn(ADMIN);
    // Signing in lands on the home page, which then sends an administrator on
    // to the lists. Opening another page before that redirect happens can be
    // undone by it, as Firefox does.
    await expect($("#quests")).toExist();

    await browser.url("/user/register");
    await $("#user-name").setValue(created);
    await $("#display-name").setValue("Made By An Admin");
    await $("#password").setValue(PASSWORD);
    await $("#password-confirm").setValue(PASSWORD);
    await $("#email").setValue(`${created}@example.com`);
    await $("#auth-level").selectByAttribute("value", "1");
    await $("#sign-up").click();

    await browser.waitUntil(
      async () => !(await browser.getUrl()).includes("/user/register")
    );
    const session = await browser.execute(async () => {
      const response = await fetch("/api/v1/sessions/current");
      return (await response.json()).user.userName as string;
    });
    expect(session).toBe(ADMIN);
    await browser.url("/logout");
  });
});

describe("an account", () => {
  const userName = `account-${unique("").slice(1)}`;
  const email = `${userName}@example.com`;
  const newPassword = "a new long enough password";
  const changedPassword = "a third long enough password";

  before(async () => {
    await api("POST", "/users", undefined, {
      userName,
      displayName: "An Account",
      email,
      password: PASSWORD,
    });
  });

  it("verifies its email address from the emailed link", async () => {
    await browser.url(await emailedLink(email, "/user/email/verify"));
    await $("#verify").click();

    await expect($("#verify-complete")).toBeDisplayed();
    await expect(browser).toHaveUrl(expect.not.stringContaining("token"));
  });

  it("asks for a reset link from the sign-in page", async () => {
    await browser.url("/login");
    await $("=Forgot password?").click();
    await $("#identifier").setValue(userName);
    await $("#send").click();

    await expect($("#sent")).toBeDisplayed();
  });

  it("resets the password from the emailed link", async () => {
    await browser.url(await emailedLink(email, "/user/password/reset"));
    await $("#new-password").setValue(newPassword);
    await $("#new-password-confirm").setValue(newPassword);
    await $("#reset-password").click();

    await expect($("#reset-complete")).toBeDisplayed();
  });

  it("can't sign in with the old password", async () => {
    await signIn(userName, PASSWORD);

    await expect($('[role="alert"]')).toHaveText(
      "Incorrect user name or password"
    );
  });

  it("edits its details, and shows the phone number as typed in", async () => {
    await signIn(userName, newPassword);
    await expect($(`a[href="/user/${userName}"]`)).toExist();

    await browser.url(`/user/${userName}`);
    await $("#edit-profile").click();
    await $("#display-name").setValue("A Renamed Account");
    await $("#phone").setValue("not a phone number");
    await $("#save-profile").click();
    await expect(
      $('#phone[aria-invalid="true"], input[aria-invalid="true"]')
    ).toExist();

    await $("#phone").setValue("312 555 0177");
    await $("#save-profile").click();

    await expect($("h1=A Renamed Account")).toBeDisplayed();
    await expect($("#user-details")).toHaveText(
      expect.stringContaining("(312) 555-0177")
    );
  });

  it("changes its password, and stays signed in", async () => {
    await $("#current-password").setValue("the wrong password");
    await $("#new-password").setValue(changedPassword);
    await $("#new-password-confirm").setValue(changedPassword);
    await $("#change-password-button").click();
    await expect($('#change-password [role="alert"]')).toExist();

    await $("#current-password").setValue(newPassword);
    await $("#change-password-button").click();

    await expect($("#change-password").$("[role='status']")).toHaveText(
      expect.stringContaining("Your password has been changed")
    );
    await browser.refresh();
    await expect($("#user-details")).toBeDisplayed();
  });

  it("signs in with the changed password, and out again", async () => {
    await browser.url("/logout");
    await signIn(userName, changedPassword);
    await expect($(`a[href="/user/${userName}"]`)).toExist();

    await browser.url("/logout");
    await browser.url(`/user/${userName}`);
    await expect($("#login")).toBeDisplayed();
  });
});
