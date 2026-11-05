/* global questName, puzzleName -- defined by an inline script in the page */
import { callApi } from "./api.js";
const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");

function drawToCanvas(videoElement, context, width, height) {
  if (videoElement.paused || videoElement.ended) {
    return false;
  }

  const startX = videoElement.videoWidth / 2 - width / 2;
  const startY = videoElement.videoHeight / 2 - height / 2;
  context.drawImage(
    videoElement,
    startX,
    startY,
    width,
    height,
    0,
    0,
    width,
    height
  );
  setTimeout(drawToCanvas, 20, videoElement, context, width, height);
}

function startCamera() {
  const videoElement = document.querySelector("video");
  navigator.mediaDevices
    .getUserMedia({
      video: {
        height: { min: 480, ideal: 1080 },
        facingMode: "environment",
      },
      audio: false,
    })
    .then((stream) => {
      const boundingRect = document
        .querySelector("#activation-mode")
        .getBoundingClientRect();
      const tracks = stream
        .getTracks()
        .filter((track) => track.kind === "video");
      videoElement.srcObject = stream;
      videoElement.onloadedmetadata = function (e) {
        const settings = tracks[0].getSettings();
        canvas.width = Math.min(boundingRect.width, settings.width);
        canvas.height = Math.min(
          window.innerHeight - boundingRect.bottom,
          settings.height
        );
        videoElement.play();
        document.querySelector("#scan-code-button").classList.remove("pq-hide");
      };
    });
}

function stopCamera() {
  const videoElement = document.querySelector("video");
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
  document.querySelector("#scan-code-button").classList.add("pq-hide");
}

/**
 * Sends the puzzle's activation code: typed, or a scanned camera frame.
 * @param {{ body?: object, formData?: FormData }} data the code, as JSON,
 *  or the frame, as form data
 * @returns {Promise<string | undefined>} why it wasn't activated, if it wasn't
 */
async function sendActivationData(data) {
  const response = await callApi(
    `/quests/${encodeURIComponent(questName)}/puzzles/${encodeURIComponent(puzzleName)}/activation`,
    { method: "POST", ...data }
  );
  return response.ok
    ? undefined
    : (response.problem.detail ?? response.problem.title);
}

function clearError() {
  const errorDetailsElement = document.querySelector("#error-details");
  errorDetailsElement.classList.add("pq-hide");
  errorDetailsElement.innerText = "";
}

function showError(errorMessage) {
  const errorDetailsElement = document.querySelector("#error-details");
  errorDetailsElement.innerText = errorMessage;
  errorDetailsElement.classList.remove("pq-hide");
}

document.querySelector("video").addEventListener("play", (e) => {
  drawToCanvas(e.target, context, canvas.width, canvas.height);
});

[...document.querySelectorAll("input[name='auth-method'")].forEach(
  (radioButton) => {
    radioButton.addEventListener("change", (e) => {
      e.preventDefault();
      if (e.target.value === "qr") {
        clearError();
        startCamera();
        document.querySelector("#text-entry").classList.add("pq-hide");
        document.querySelector("#qr-code-scanner").classList.remove("pq-hide");
      } else if (e.target.value === "text") {
        clearError();
        stopCamera();
        document.querySelector("#qr-code-scanner").classList.add("pq-hide");
        document.querySelector("#text-entry").classList.remove("pq-hide");
      } else {
        stopCamera();
        document.querySelector("#qr-code-scanner").classList.add("pq-hide");
        document.querySelector("#text-entry").classList.add("pq-hide");
      }
    });
  }
);

document
  .querySelector("#scan-code-button button")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    e.target.enabled = false;
    const videoElement = document.querySelector("video");
    videoElement.pause();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const formData = new FormData();
    formData.append("height", imageData.height);
    formData.append("width", imageData.width);
    formData.append("image", new Blob([imageData.data.buffer]));
    const error = await sendActivationData({ formData });
    e.target.enabled = true;
    if (error) {
      showError(error);
      startCamera();
    } else {
      window.location.reload();
    }
  });

document
  .querySelector("#send-code-text-button")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    e.target.enabled = false;
    const error = await sendActivationData({
      body: { activationCode: document.querySelector("#text-auth-code").value },
    });
    e.target.enabled = true;
    if (error) {
      showError(error);
    } else {
      window.location.reload();
    }
  });

const worker = new Worker("/script/socket.js");
worker.postMessage({ message: "init", url: window.location.href });
worker.addEventListener("message", (evt) => {
  const messageData = JSON.parse(evt.data);
  if (messageData.message === "connection") {
    // The server now sends this page its updates; earlier ones never reach it.
    document.body.dataset.liveUpdates = "connected";
    return;
  }
  if (messageData.message === "questUpdated") {
    // An administrator changed the quest, such as pausing it; reload to show
    // its current state.
    window.location.reload();
    return;
  }
  if (messageData.message === "puzzleActivated") {
    window.location.reload();
  }
});
