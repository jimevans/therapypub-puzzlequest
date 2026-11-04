import { callApi } from "./api.js";

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  errorNotifier.querySelector("span").innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

document.querySelector("#send").addEventListener("click", async (e) => {
  e.preventDefault();
  document.querySelector(".pq-error").classList.add("pq-hide");
  const identifier = document.querySelector("#identifier").value.trim();
  if (!identifier) {
    showError("Enter your user name or email address");
    return;
  }
  const response = await callApi("/password-reset-requests", {
    method: "POST",
    body: { identifier },
  });
  if (!response.ok) {
    showError(response.problem.detail ?? response.problem.title);
    return;
  }
  document.querySelector("#forgot-form").classList.add("pq-hide");
  document.querySelector("#sent").classList.remove("pq-hide");
});

document.querySelector("#cancel").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "/login";
});
