import { callApi } from "./api.js";

// The reminder to verify an email address (views/partials/emailReminder.ejs),
// when the page shows it.
const reminder = document.querySelector("#email-reminder");
if (reminder) {
  const button = reminder.querySelector("#resend-verification");
  const result = reminder.querySelector("#resend-verification-result");
  button.addEventListener("click", async () => {
    button.disabled = true;
    const response = await callApi(
      `/users/${encodeURIComponent(reminder.dataset.userName)}/email-verification-requests`,
      { method: "POST" }
    );
    result.innerText = response.ok
      ? "Sent. Check your inbox."
      : (response.problem.detail ?? response.problem.title);
    if (!response.ok) {
      button.disabled = false;
    }
  });
}
