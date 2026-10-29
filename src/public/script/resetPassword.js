/* global resetToken -- defined by an inline script in the page */
import { callDataApi } from "./fetch.js";

const MINIMUM_PASSWORD_LENGTH = 8;

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  errorNotifier.querySelector("span").innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

// Remove the token from the address bar and browser history.
window.history.replaceState(null, "", window.location.pathname);

if (!resetToken) {
  showError("This password reset link is invalid. Request a new one from the sign in page.");
  document.querySelector("#reset").disabled = true;
}

document.querySelector("#reset").addEventListener("click", async (e) => {
  e.preventDefault();
  document.querySelector(".pq-error").classList.add("pq-hide");
  const newPassword = document.querySelector("#new-password").value;
  const confirmPassword = document.querySelector("#new-password-confirm").value;
  if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
    showError(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`);
    return;
  }
  if (newPassword !== confirmPassword) {
    showError("New password and confirm password do not match");
    return;
  }
  const response = await callDataApi("/api/user/password/reset", "post", {
    resetToken,
    newPassword,
  });
  if (response.status === "error") {
    showError(response.message);
    return;
  }
  document.querySelector("#reset-form").classList.add("pq-hide");
  document.querySelector("#reset-complete").classList.remove("pq-hide");
});
