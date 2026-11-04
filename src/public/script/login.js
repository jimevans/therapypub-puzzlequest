/* global requestingUrl -- defined by an inline script in the page */
import { callApi } from "./api.js";

/**
 * Determines whether a URL is a path on this site, rather than an address
 * elsewhere such as "//example.com" (or "/\example.com", which browsers
 * read the same way).
 * @param {string} url the URL
 * @returns {boolean} true for a path on this site
 */
function isLocalPath(url) {
  return typeof url === "string" && /^\/(?![/\\])/.test(url);
}

document.querySelector("#login").addEventListener("click", async (e) => {
  e.preventDefault();
  const error = document.querySelector(".pq-error");
  error.classList.add("pq-hide");
  try {
    const response = await callApi("/sessions", {
      method: "POST",
      body: {
        userName: document.querySelector("#user-name").value,
        password: document.querySelector("#password").value,
      },
    });
    if (response.ok) {
      // The server sets the session cookie. Go back to the page that asked
      // for sign-in, if it's a page on this site.
      window.location.href = isLocalPath(requestingUrl) ? requestingUrl : "/";
    } else {
      error.querySelector("span").textContent =
        response.problem.type === "/problems/invalid-request"
          ? "Enter your user name and password"
          : response.problem.title;
      error.classList.remove("pq-hide");
    }
  } catch (err) {
    console.log("error: " + err);
  }
});

document.querySelector("#cancel").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "/";
});
