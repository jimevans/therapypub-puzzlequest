
const numberFormatter = new Intl.NumberFormat("en", {minimumIntegerDigits: 2});

function calculateElapsed(startTime) {
  const elapsedSeconds = Math.trunc(Date.now() - startTime) / 1000;
  const hours = Math.trunc(elapsedSeconds / 3600);
  const minutes = Math.trunc((elapsedSeconds % 3600) / 60);
  const seconds = Math.trunc((elapsedSeconds % 3600) % 60);
  return `${numberFormatter.format(hours)}:${numberFormatter.format(minutes)}:${numberFormatter.format(seconds)}`;
}

function updateTimes(timesToUpdate) {
  if (timesToUpdate.length) {
    timesToUpdate.forEach(timeToUpdate => {
      timeToUpdate.element.innerText = calculateElapsed(timeToUpdate.startTime);
    });
    setTimeout(updateTimes, 1000, timesToUpdate);
  }
}

const elapsedTimeElements = document.querySelectorAll("[data-quest-start]");
if (elapsedTimeElements.length) {
  const timesToUpdate = [];
  elapsedTimeElements.forEach((elapsedTimeElement) => {
    timesToUpdate.push({
      element: elapsedTimeElement,
      startTime: Date.parse(elapsedTimeElement.getAttribute("data-quest-start"))
    });
  });
  updateTimes(timesToUpdate);
}
