import { FireworksOverlay } from "./components/fireworksOverlay.js";

const numberFormatter = new Intl.NumberFormat("en", {
  minimumIntegerDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function calculateElapsed(startTime, endTime) {
  const finishTime = endTime ? endTime : Date.now();
  const elapsedSeconds = Math.trunc(finishTime - startTime) / 1000;
  const hours = Math.trunc(elapsedSeconds / 3600);
  const minutes = Math.trunc((elapsedSeconds % 3600) / 60);
  const seconds = Math.trunc((elapsedSeconds % 3600) % 60);
  return `${numberFormatter.format(hours)}:${numberFormatter.format(
    minutes
  )}:${numberFormatter.format(seconds)}`;
}

function updateTime(startTime, currentTimeElement) {
  if (startTime && currentTimeElement) {
    currentTimeElement.innerText = calculateElapsed(startTime);
    if (currentTimeElement.hasAttribute("data-puzzle-start")) {
      setTimeout(updateTime, 1000, startTime, currentTimeElement);
    }
  }
}

function startElapsedTimeClock(currentTimeElement) {
  if (currentTimeElement) {
    const startTime = Date.parse(
      currentTimeElement.getAttribute("data-puzzle-start")
    );
    updateTime(startTime, currentTimeElement);
  }
}

function createNewPuzzleElement(messageData) {
  const startTime = Date.parse(messageData.startTime);

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

  const startTimeElement = document.createElement("div");
  startTimeElement.classList.add("pq-quest-puzzle-time");
  startTimeElement.setAttribute("data-time", "start");
  startTimeElement.innerHTML = `<strong>Start time:</strong><br><span>${dateFormatter.format(
    startTime
  )}</span>`;
  puzzleElement.appendChild(startTimeElement);

  const activationTimeElement = document.createElement("div");
  activationTimeElement.classList.add("pq-quest-puzzle-time");
  activationTimeElement.setAttribute("data-time", "activation");
  activationTimeElement.innerHTML = `<strong>Activation time:</strong><br><span>-</span>`;
  puzzleElement.appendChild(activationTimeElement);

  const endTimeElement = document.createElement("div");
  endTimeElement.classList.add("pq-quest-puzzle-time");
  endTimeElement.setAttribute("data-time", "solution");
  endTimeElement.innerHTML = `<strong>Solution time:</strong><br><span>-</span>`;
  puzzleElement.appendChild(endTimeElement);

  const elapsedTimeElement = document.createElement("div");
  elapsedTimeElement.classList.add("pq-quest-puzzle-time");
  elapsedTimeElement.setAttribute("data-time", "elapsed");
  elapsedTimeElement.innerHTML = `<strong>Elapsed time:</strong><br><span data-puzzle-start="${messageData.startTime}">-</span>`;
  puzzleElement.appendChild(elapsedTimeElement);

  const solutionElement = document.createElement("div");
  solutionElement.classList.add("pq-quest-puzzle-solution");
  const solutionTextElement = document.createElement("span");
  solutionElement.appendChild(solutionTextElement);
  puzzleElement.appendChild(solutionElement);
  return puzzleElement;
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

const currentTimeElement = document.querySelector("[data-puzzle-start]");
startElapsedTimeClock(currentTimeElement);

const worker = new Worker("/script/socket.js");
worker.postMessage({ message: "init", url: window.location.href });
worker.addEventListener("message", (evt) => {
  const messageData = JSON.parse(evt.data);
  if (messageData.message === "puzzleStarted") {
    if (
      !document.querySelector(`[data-puzzle-name = "${messageData.puzzleName}"]`)
    ) {
      const newPuzzleElement = createNewPuzzleElement(messageData);
      const puzzlesContainer = document.querySelector("#puzzles");
      puzzlesContainer.appendChild(newPuzzleElement);
      startElapsedTimeClock(document.querySelector("[data-puzzle-start]"));
      newPuzzleElement.classList.add("pq-data-highlight");
      removeHighlights();
    }
  } else if (messageData.message === "puzzleActivated") {
    const puzzleElement = document.querySelector(
      `[data-puzzle-name="${messageData.puzzleName}"]`
    );
    const activationTime = Date.parse(messageData.activationTime);

    const puzzleNameElement = puzzleElement.querySelector(".pq-quest-puzzle-link");
    const displayName = puzzleNameElement.innerText;
    const nameLink = document.createElement("a");
    nameLink.href = `/monitor/quest/${messageData.questName}/puzzle/${messageData.puzzleName}`;
    nameLink.innerText = displayName;
    puzzleElement.querySelector(".pq-quest-puzzle-link").replaceChildren(nameLink);

    puzzleElement.querySelector(".pq-quest-puzzle-status span").innerText =
      "In Progress";
    puzzleElement.querySelector(
      ".pq-quest-puzzle-time[data-time='activation'] span"
    ).innerText = dateFormatter.format(activationTime);
    puzzleElement.classList.add("pq-data-highlight");
    removeHighlights();
  } else if (messageData.message === "puzzleSolved") {
    const puzzleElement = document.querySelector(
      `[data-puzzle-name = ${messageData.puzzleName}]`
    );
    const endTime = Date.parse(messageData.endTime);
    puzzleElement.querySelector(".pq-quest-puzzle-status span")
      .innerText = "Completed";
    puzzleElement.querySelector(".pq-quest-puzzle-time[data-time='solution'] span")
      .innerText = dateFormatter.format(endTime);
    const elapsed = puzzleElement.querySelector(
      ".pq-quest-puzzle-time[data-time='elapsed'] span"
    );
    if (elapsed.hasAttribute("data-puzzle-start")) {
      const startTime = Date.parse(
        elapsed.getAttribute("data-puzzle-start")
      );
      elapsed.removeAttribute("data-puzzle-start");
      elapsed.innerText = calculateElapsed(startTime, endTime);
    }
    puzzleElement.querySelector(
      ".pq-quest-puzzle-solution span"
    ).innerHTML = `<strong>Solution:</strong>&nbsp;${messageData.solutionText}`;
    puzzleElement.classList.add("pq-data-highlight");
    removeHighlights();
  }
});
