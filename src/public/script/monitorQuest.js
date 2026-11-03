import {
  addHintPenalty,
  appendPuzzleTimes,
  formatTime,
  startClocks,
  stopPuzzleClocks,
} from "./questProgress.js";

function createNewPuzzleElement(messageData) {
  const puzzleElement = document.createElement("div");
  puzzleElement.classList.add("pq-quest-puzzle");
  puzzleElement.setAttribute("data-puzzle-name", messageData.puzzleName);

  const nameElement = document.createElement("div");
  nameElement.classList.add("pq-quest-puzzle-link");
  nameElement.innerText = messageData.displayName;
  puzzleElement.appendChild(nameElement);

  const statusElement = document.createElement("div");
  statusElement.classList.add("pq-quest-puzzle-status");

  const statusSpan = document.createElement("span");
  statusSpan.innerText = "Awaiting Activation";
  statusElement.appendChild(statusSpan);
  puzzleElement.appendChild(statusElement);

  appendPuzzleTimes(puzzleElement, messageData.startTime);

  const solutionElement = document.createElement("div");
  solutionElement.classList.add("pq-quest-puzzle-solution");
  const solutionTextElement = document.createElement("span");
  solutionElement.appendChild(solutionTextElement);
  puzzleElement.appendChild(solutionElement);
  return puzzleElement;
}

function findPuzzleElement(puzzleName) {
  return document.querySelector(`[data-puzzle-name="${puzzleName}"]`);
}

function removeHighlights() {
  setTimeout(
    () =>
      [...document.querySelectorAll(".pq-data-highlight")].forEach((element) =>
        element.classList.remove("pq-data-highlight")
      ),
    3000
  );
}

startClocks();

const worker = new Worker("/script/socket.js");
worker.postMessage({ message: "init", url: window.location.href });
worker.addEventListener("message", (evt) => {
  const messageData = JSON.parse(evt.data);
  if (messageData.message === "questUpdated") {
    // An administrator changed the quest, such as pausing it; reload to show
    // its current state.
    window.location.reload();
    return;
  }
  if (messageData.message === "puzzleStarted") {
    if (!findPuzzleElement(messageData.puzzleName)) {
      const newPuzzleElement = createNewPuzzleElement(messageData);
      const puzzlesContainer = document.querySelector("#puzzles");
      puzzlesContainer.appendChild(newPuzzleElement);
      newPuzzleElement.classList.add("pq-data-highlight");
      removeHighlights();
    }
  } else if (messageData.message === "puzzleActivated") {
    const puzzleElement = findPuzzleElement(messageData.puzzleName);
    const activationTime = Date.parse(messageData.activationTime);

    const puzzleNameElement = puzzleElement.querySelector(
      ".pq-quest-puzzle-link"
    );
    const displayName = puzzleNameElement.innerText;
    const nameLink = document.createElement("a");
    nameLink.href = `/monitor/quest/${messageData.questName}/puzzle/${messageData.puzzleName}`;
    nameLink.innerText = displayName;
    puzzleNameElement.replaceChildren(nameLink);

    puzzleElement.querySelector(".pq-quest-puzzle-status span").innerText =
      "In Progress";
    puzzleElement.querySelector(
      ".pq-quest-puzzle-time[data-time='activation'] span"
    ).innerText = formatTime(activationTime);
    puzzleElement.classList.add("pq-data-highlight");
    removeHighlights();
  } else if (messageData.message === "puzzleSolved") {
    const puzzleElement = findPuzzleElement(messageData.puzzleName);
    const endTime = Date.parse(messageData.endTime);
    puzzleElement.querySelector(".pq-quest-puzzle-status span").innerText =
      "Completed";
    puzzleElement.querySelector(
      ".pq-quest-puzzle-time[data-time='end'] span"
    ).innerText = formatTime(endTime);
    stopPuzzleClocks(puzzleElement, endTime, messageData.questComplete);
    puzzleElement.querySelector(".pq-quest-puzzle-solution span").innerHTML =
      `<strong>Solution:</strong>&nbsp;${messageData.solutionText}`;
    puzzleElement.classList.add("pq-data-highlight");
    removeHighlights();
  } else if (messageData.message === "hintRequested") {
    const puzzleElement = findPuzzleElement(messageData.puzzleName);
    if (puzzleElement) {
      addHintPenalty(puzzleElement, messageData.timePenalty);
      puzzleElement.classList.add("pq-data-highlight");
      removeHighlights();
    }
  }
});
