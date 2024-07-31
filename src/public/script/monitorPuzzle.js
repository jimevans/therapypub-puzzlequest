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

function displaySolution(solutionText) {
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
  } else if (messageData.message === "hintRequested") {
    const hintElement = displayHint(messageData.hintText);
    hintElement.classList.add("pq-data-highlight");
    removeHighlights();
  }
});
