import { callDataApi } from "./fetch.js";

// The reminder to verify an email address (views/partials/emailReminder.ejs),
// when the page shows it.
const reminder = document.querySelector("#email-reminder");
if (reminder) {
  const button = reminder.querySelector("#resend-verification");
  const result = reminder.querySelector("#resend-verification-result");
  button.addEventListener("click", async () => {
    button.disabled = true;
    const response = await callDataApi(
      `/api/user/${encodeURIComponent(reminder.dataset.userName)}/email/verification`,
      "post"
    );
    result.innerText =
      response.status === "success"
        ? "Sent. Check your inbox."
        : response.message;
    if (response.status !== "success") {
      button.disabled = false;
    }
  });
}
