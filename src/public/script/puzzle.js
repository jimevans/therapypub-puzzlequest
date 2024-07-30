import { FireworksOverlay } from "./components/fireworksOverlay.js";
import { Modal } from "./components/modal.js";
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
    { guess: solutionGuess, connectionId }
  );
}

async function requestHint(requestHintElement) {
  const hintResponse = await callDataApi(
    `/api/quest/${questName}/puzzle/${puzzleName}/hint`,
    "put",
    { connectionId }
  );

  if (hintResponse.status === "error") {
    return;
  }
  if (hintResponse.status === "success") {
    updateHintDisplay(requestHintElement, hintResponse.data);
  }
}

function updateHintDisplay(requestHintElement, hintDisplayData) {
  if (hintDisplayData.isNextHintSolution) {
    requestHintElement.setAttribute("data-solution-warning", "true")
  }

  const hintElement = displayHint(hintDisplayData.hintText);
  if (!hintDisplayData.moreHints) {
    displayNoMoreHints(requestHintElement);
  }
  return hintElement;
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
  return hintElement;
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

function displaySolution(solutionText) {
  document.querySelector("#solve").classList.add("pq-hide");
  document.querySelector("#request-hint").classList.add("pq-hide");
  document.querySelector("#solution-text").innerText = solutionText;
  const solutionElement = document.querySelector("#solution");
  solutionElement.classList.remove("pq-hide");
  return solutionElement;
}

function removeHighlights() {
  setTimeout(
    () =>
      [...document.querySelectorAll(".pq-data-highlight")]
        .forEach((element) => element.classList.remove("pq-data-highlight")
      ),
    3000
  );
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
      displaySolution(guessResult.data.solutionText);
      if (guessResult.data.questComplete) {
        const fireworks = new FireworksOverlay();
        fireworks.render("Congratulations! Your quest is complete!", 15000);
      }
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

let connectionId = "";
const worker = new Worker("/script/socket.js");
worker.postMessage({ message: "init", url: window.location.href });
worker.addEventListener("message", (evt) => {
  const messageData = JSON.parse(evt.data);
  if (messageData.message === "connection") {
    connectionId = messageData.connectionId;
  } else if (messageData.message === "puzzleSolved") {
    const solutionElement = displaySolution(messageData.solutionText);
    solutionElement.classList.add("pq-data-highlight");
    removeHighlights();
    if (messageData.questComplete) {
      const fireworks = new FireworksOverlay();
      fireworks.render("Congratulations! Your quest is complete!", 15000);
    }
  } else if (messageData.message === "hintRequested") {
    const hintElement = updateHintDisplay(document.querySelector("#request-hint"), messageData);
    hintElement.classList.add("pq-data-highlight");
    removeHighlights();
  }
});
