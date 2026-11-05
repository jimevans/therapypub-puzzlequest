// Quest and puzzle progress on the home, quest, and monitor pages: elapsed
// time, hint penalties, and total time, shown as hh:mm:ss. Each time is an
// element with data-progress ("elapsed", "penalty", or "total") and
// data-duration, in milliseconds. While its clock runs, the element also has
// data-clock-start, and the time since then is added and kept current.

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Formats a date and time the way the pages show them.
 * @param {number} time the time, in milliseconds since the epoch
 * @returns {string} the formatted time
 */
export function formatTime(time) {
  return dateFormatter.format(time);
}

/**
 * Formats a length of time as hh:mm:ss.
 * @param {number} ms the length of time, in milliseconds
 * @returns {string} the formatted length of time
 */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.trunc(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.trunc(seconds / 3600))}:${pad(
    Math.trunc((seconds % 3600) / 60)
  )}:${pad(seconds % 60)}`;
}

function render(element) {
  const clockStart = element.dataset.clockStart;
  const ms =
    Number(element.dataset.duration) +
    (clockStart ? Date.now() - Date.parse(clockStart) : 0);
  element.innerText = formatDuration(ms);
}

/**
 * Keeps every running clock on the page current, including clocks added
 * later.
 */
export function startClocks() {
  setInterval(
    () => document.querySelectorAll("[data-clock-start]").forEach(render),
    1000
  );
}

/**
 * Creates a time element for a puzzle that has just become available.
 * @param {string} part "elapsed", "penalty", or "total"
 * @param {string} [clockStart] when the clock started, if it runs
 * @returns {HTMLElement} the element
 */
export function createDurationElement(part, clockStart) {
  const element = document.createElement("span");
  element.dataset.progress = part;
  element.dataset.duration = "0";
  if (clockStart) {
    element.dataset.clockStart = clockStart;
  }
  render(element);
  return element;
}

function createTimeField(time, label, content) {
  const field = document.createElement("div");
  field.classList.add("pq-quest-puzzle-time");
  field.dataset.time = time;
  const labelElement = document.createElement("strong");
  labelElement.innerText = label;
  field.append(labelElement, document.createElement("br"), content);
  return field;
}

function createTextElement(text) {
  const element = document.createElement("span");
  element.innerText = text;
  return element;
}

/**
 * Adds the time fields to the card of a puzzle that has just become
 * available, with its clocks running.
 * @param {HTMLElement} puzzleElement the puzzle's card
 * @param {string} startTime when the puzzle became available
 */
export function appendPuzzleTimes(puzzleElement, startTime) {
  puzzleElement.append(
    createTimeField(
      "start",
      "Start time:",
      createTextElement(formatTime(Date.parse(startTime)))
    ),
    createTimeField("activation", "Activation time:", createTextElement("-")),
    createTimeField("end", "Solution time:", createTextElement("-")),
    createTimeField(
      "elapsed",
      "Elapsed time:",
      createDurationElement("elapsed", startTime)
    ),
    createTimeField(
      "penalty",
      "Hint penalties:",
      createDurationElement("penalty")
    ),
    createTimeField(
      "total",
      "Total time:",
      createDurationElement("total", startTime)
    )
  );
}

function addDuration(element, ms) {
  if (element) {
    element.dataset.duration = String(Number(element.dataset.duration) + ms);
    render(element);
  }
}

function stopClock(element, endTime) {
  const clockStart = element.dataset.clockStart;
  if (clockStart) {
    element.dataset.duration = String(
      Number(element.dataset.duration) + endTime - Date.parse(clockStart)
    );
    delete element.dataset.clockStart;
  }
  render(element);
}

/**
 * Adds a revealed hint's time penalty to a puzzle card's and the quest
 * summary's penalties and totals.
 * @param {HTMLElement} puzzleElement the puzzle's card
 * @param {number} timePenalty the hint's time penalty, in seconds
 */
export function addHintPenalty(puzzleElement, timePenalty) {
  const questElement = document.querySelector("#quest-progress");
  for (const container of [puzzleElement, questElement]) {
    for (const part of ["penalty", "total"]) {
      addDuration(
        container?.querySelector(`[data-progress="${part}"]`),
        timePenalty * 1000
      );
    }
  }
}

/**
 * Stops the clocks of a solved puzzle's card and, if it completed the quest,
 * of the quest summary.
 * @param {HTMLElement} puzzleElement the puzzle's card
 * @param {number} endTime when the puzzle was solved, in milliseconds since
 *  the epoch
 * @param {boolean} questComplete true if the quest is complete
 */
export function stopPuzzleClocks(puzzleElement, endTime, questComplete) {
  puzzleElement
    .querySelectorAll("[data-clock-start]")
    .forEach((element) => stopClock(element, endTime));
  const questElement = document.querySelector("#quest-progress");
  if (questComplete && questElement) {
    questElement
      .querySelectorAll("[data-clock-start]")
      .forEach((element) => stopClock(element, endTime));
    questElement.querySelector("[data-time='end'] span").innerText =
      formatTime(endTime);
    questElement.querySelector(".pq-quest-status").innerText = "Completed";
  }
}
