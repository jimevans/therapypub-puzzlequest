import { Modal } from "../script/components/modal.js";

async function callDataApi(url, verb, body) {
  try {
    const response = await fetch(url, {
      method: verb,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
    });
    return response.json();
  } catch (err) {
    console.log("error: " + err);
  }
}

async function submitGuess(solutionGuess) {
  if (!solutionGuess) {
    return { error: "No guess entered to submit" };
  }
  return await callDataApi(
    `/api/quest/${questName}/puzzle/${puzzleName}/solve`,
    "put",
    { guess: solutionGuess }
  );
}

async function requestHint() {
  const hintResponse = await callDataApi(
    `/api/quest/${questName}/puzzle/${puzzleName}/hint`,
    "put",
    {}
  );
  if ("error" in hintResponse) {
    console.log(hintResponse);
  }

  if (hintResponse.isNextHintSolution) {
    e.target.setAttribute("data-solution-warning", "true")
  }

  displayHint(hintResponse.hintText);
  if (!hintResponse.moreHints) {
    displayNoMoreHints(e.target);
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
    const errorElement = document.querySelector("#solution-errors");
    errorElement.classList.add("pq-hide");
    errorElement.innerText = "";
    const guessResult = await submitGuess(document.querySelector("#solution-guess").value);
    if ("error" in guessResult) {
      errorElement.innerText = guessResult.error;
      errorElement.classList.remove("pq-hide");
    } else {
      document.querySelector("#solve").classList.add("pq-hide");
      document.querySelector("#solution-text").innerText = guessResult.solution;
      document.querySelector("#solution").classList.remove("pq-hide");
    }
  });
}

document.querySelector("#request-hint").addEventListener("click", async (e) => {
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
        await requestHint();
      };
      modal.onCancelButtonClick = (e) => {
        modal.hide();
      }
      modal.show();
      return;
    }
    await requestHint();
  }
});
