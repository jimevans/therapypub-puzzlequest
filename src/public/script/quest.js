
const numberFormatter = new Intl.NumberFormat("en", {minimumIntegerDigits: 2});

function calculateElapsed(startTime) {
  const elapsedSeconds = Math.trunc(Date.now() - startTime) / 1000;
  const hours = Math.trunc(elapsedSeconds / 3600);
  const minutes = Math.trunc((elapsedSeconds % 3600) / 60);
  const seconds = Math.trunc((elapsedSeconds % 3600) % 60);
  return `${numberFormatter.format(hours)}:${numberFormatter.format(minutes)}:${numberFormatter.format(seconds)}`;
}

function updateTime(startTime) {
  const currentTime = document.querySelector("#current");
  if (startTime && currentTime) {
    currentTime.innerText = calculateElapsed(startTime);
    setTimeout(updateTime, 1000, startTime);
  }
}

updateTime(currentPuzzleStartTime);
