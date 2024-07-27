import { Modal } from "../script/components/modal.js";
import { callDataApi } from "./fetch.js";

async function submitGuess(solutionGuess) {
  if (!solutionGuess) {
    return {
      status: "error",
      message: "No guess entered to submit"
    };
  }
  return await callDataApi(
    `/api/quest/${questName}/puzzle/${puzzleName}/solve`,
    "put",
    { guess: solutionGuess }
  );
}

async function requestHint(requestHintElement) {
  const hintResponse = await callDataApi(
    `/api/quest/${questName}/puzzle/${puzzleName}/hint`,
    "put",
    {}
  );

  if (hintResponse.status === "error") {
    console.log(hintResponse);
    return;
  }
  if (hintResponse.data.isNextHintSolution) {
    requestHintElement.setAttribute("data-solution-warning", "true")
  }

  displayHint(hintResponse.data.hintText);
  if (!hintResponse.data.moreHints) {
    displayNoMoreHints(requestHintElement);
  }
}

function displayHint(hintText) {
  const hintContainer = document.querySelector("#used-hints");
  const hintElement = document.createElement("p");
  hintElement.classList.add("pq-hint");
  hintElement.innerText = hintText;
  if (hintContainer.querySelectorAll(".pq-hint").length) {
    hintContainer.appendChild(hintElement);
  } else {
    hintContainer.replaceChildren(hintElement);
  }
}

function displayNoMoreHints(hintRequestElement) {
  const headerElement = hintRequestElement.parentNode;
  const noMoreHintElement = document.createElement("span");
  noMoreHintElement.classList.add("pq-float-right");
  noMoreHintElement.id = "request-hint";
  noMoreHintElement.innerText = "No available hints"
  headerElement.removeChild(hintRequestElement);
  headerElement.appendChild(noMoreHintElement);
}

const isSolveAvailable = document.querySelector("#solve");
if (isSolveAvailable) {
  document.querySelector("#submit-button").addEventListener("click", async (e) => {
    e.preventDefault();
    const errorElement = document.querySelector("#solution-errors");
    errorElement.classList.add("pq-hide");
    errorElement.innerText = "";
    const guessResult = await submitGuess(document.querySelector("#solution-guess").value);
    if (guessResult.status === "error") {
      errorElement.innerText = guessResult.message;
      errorElement.classList.remove("pq-hide");
    } else {
      document.querySelector("#solve").classList.add("pq-hide");
      document.querySelector("#request-hint").classList.add("pq-hide");
      document.querySelector("#solution-text").innerText = guessResult.data;
      document.querySelector("#solution").classList.remove("pq-hide");
    }
  });
}

document.querySelector("#request-hint")?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (e.target.hasAttribute("href")) {
    if (e.target.hasAttribute("data-solution-warning")) {
      const modal = new Modal();
      modal.setConfirmButtonText("Yes");
      modal.setCancelButtonText("No");
      modal.setTitle("Warning");
      const modalBody = document.createElement("div");
      modalBody.innerText = "The next hint will show you the solution. Are you sure you want to do this?";
      modal.setBodyContent(modalBody);
      modal.onConfirmButtonClick = async (e) => {
        modal.hide();
        await requestHint(e.target);
      };
      modal.onCancelButtonClick = (e) => {
        modal.hide();
      }
      modal.show();
      return;
    }
    await requestHint(e.target);
  }
});
