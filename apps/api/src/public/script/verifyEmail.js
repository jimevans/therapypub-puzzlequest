/* global verificationToken -- defined by an inline script in the page */
import { callApi } from "./api.js";

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  errorNotifier.querySelector("span").innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

// Remove the token from the address bar and browser history.
window.history.replaceState(null, "", window.location.pathname);

if (!verificationToken) {
  showError(
    "This verification link is invalid. Sign in to send a new one from your profile."
  );
  document.querySelector("#verify").disabled = true;
}

document.querySelector("#verify").addEventListener("click", async (e) => {
  e.preventDefault();
  document.querySelector(".pq-error").classList.add("pq-hide");
  const response = await callApi("/email-verifications", {
    method: "POST",
    body: { token: verificationToken },
  });
  if (!response.ok) {
    showError(response.problem.detail ?? response.problem.title);
    return;
  }
  document.querySelector("#verify-form").classList.add("pq-hide");
  document.querySelector("#verify-complete").classList.remove("pq-hide");
});
