// Verifying an email address and resetting a forgotten password, from the
// links the server emails.
import { PASSWORD, api, emailedLink, signIn, unique } from "../support.js";

describe("an account", () => {
  const userName = `account-${unique("").slice(1)}`;
  const email = `${userName}@example.com`;
  const newPassword = "a new long enough password";

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

  it("signs in with the new password, and out again", async () => {
    await signIn(userName, newPassword);
    await expect($(`a[href="/user/${userName}"]`)).toExist();

    await browser.url("/logout");
    await browser.url(`/user/${userName}`);
    await expect($("#login")).toBeDisplayed();
  });
});
