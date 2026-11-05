/* global quest -- defined by an inline script in the page */
import { DataGrid } from "./components/grid.js";
import { Modal } from "./components/modal.js";
import { TextMessageComposer } from "./components/textMessageComposer.js";
import { callApi } from "./api.js";

/** The quest's path in the v1 API. */
const questPath = `/quests/${encodeURIComponent(quest.name)}`;

function addGeneratorButtons(gridElement) {
  const buttonCells = [
    ...gridElement.querySelectorAll("tbody tr td:last-of-type"),
  ];
  buttonCells.forEach((cell) => {
    const svgElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    svgElement.classList.add("pq-icon");
    svgElement.setAttribute("viewBox", "0 0 24 24");

    const useElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "use"
    );
    useElement.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "xlink:href",
      "/image/qr.svg#qr"
    );
    useElement.setAttribute("href", "/image/qr.svg#qr");
    svgElement.appendChild(useElement);

    const row = cell.parentNode;
    const puzzleName = row.querySelector(
      "td[data-field-name='puzzleName']"
    ).innerText;
    const qrGenerationLink = document.createElement("a");
    qrGenerationLink.classList.add("pq-icon-link");
    qrGenerationLink.href = `/quest/${quest.name}/puzzle/${puzzleName}/qrcode`;
    qrGenerationLink.appendChild(svgElement);
    cell.appendChild(qrGenerationLink);
  });
}

document
  .querySelector("#activate-link")
  ?.addEventListener("click", async (e) => {
    e.preventDefault();
    document.querySelector("#nav-checkbox").checked = false;
    const response = await callApi(`${questPath}/start`, { method: "POST" });
    if (!response.ok) {
      window.alert(response.problem.detail ?? response.problem.title);
      return;
    }
    window.location.href = e.target.href;
  });

document.querySelector("#reset-link")?.addEventListener("click", async (e) => {
  e.preventDefault();
  document.querySelector("#nav-checkbox").checked = false;
  const response = await callApi(`${questPath}/reset`, { method: "POST" });
  if (!response.ok) {
    window.alert(response.problem.detail ?? response.problem.title);
    return;
  }
  window.location.href = e.target.href;
});

for (const action of ["pause", "resume"]) {
  document
    .querySelector(`#${action}-link`)
    ?.addEventListener("click", async (e) => {
      e.preventDefault();
      document.querySelector("#nav-checkbox").checked = false;
      if (
        action === "pause" &&
        !window.confirm(
          "Pause this quest? Its clock stops, and the players can't do anything until you resume it."
        )
      ) {
        return;
      }
      const response = await callApi(`${questPath}/${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        window.alert(response.problem.detail ?? response.problem.title);
        return;
      }
      window.location.reload();
    });
}

/**
 * Sends one of the rescue actions for the puzzle chosen in "Help the
 * players", after asking the admin to confirm it.
 * @param {string} action "skip" or "reset"
 */
async function rescuePuzzle(action) {
  const select = document.querySelector("#rescue-puzzle");
  const puzzleName = select.value;
  const puzzleLabel = select.selectedOptions[0]?.text ?? puzzleName;
  const refundHints = document.querySelector("#refund-hints").checked;
  const question =
    action === "skip"
      ? `Skip ${puzzleLabel}? It will be completed with no penalty, the players will see its solution, and the next puzzle will become available.`
      : `Reset ${puzzleLabel}? The players will have to solve it again, and every puzzle after it will no longer be reached.${
          refundHints
            ? " The penalties of its revealed hints will be refunded."
            : ""
        }`;
  if (!puzzleName || !window.confirm(question)) {
    return;
  }
  const response = await callApi(
    `${questPath}/puzzles/${encodeURIComponent(puzzleName)}/${action}`,
    { method: "POST", body: action === "reset" ? { refundHints } : undefined }
  );
  if (!response.ok) {
    window.alert(response.problem.detail ?? response.problem.title);
    return;
  }
  window.location.reload();
}

document
  .querySelector("#skip-puzzle")
  ?.addEventListener("click", () => rescuePuzzle("skip"));
document
  .querySelector("#reset-puzzle")
  ?.addEventListener("click", () => rescuePuzzle("reset"));

document.querySelector("#notify-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("#nav-checkbox").checked = false;
  const modal = new Modal(2);
  const composer = new TextMessageComposer();

  modal.setTitle("Compose Text Message");
  modal.setBodyContent(composer.getElement());
  modal.setConfirmButtonText("Send message");
  modal.setCancelButtonText("Cancel");
  modal.onCancelButtonClick = (e) => modal.hide();
  modal.onConfirmButtonClick = async (e) => {
    e.target.disabled = true;
    const message = composer.getMessage();
    const expectedResponse = composer.getExpectedResponse();
    const responseConfirmation = composer.getResponseConfirmation();
    if (message.length === 0) {
      e.target.disabled = false;
      return;
    }
    const messagePayload = { message };
    if (expectedResponse) {
      if (!responseConfirmation) {
        composer.setError(
          "An expected response requires a response confirmation"
        );
        return;
      }
      messagePayload.expectedResponse = expectedResponse;
      messagePayload.responseConfirmation = responseConfirmation;
    }
    const sendMessageResponse = await callApi(`${questPath}/text-messages`, {
      method: "POST",
      body: messagePayload,
    });
    if (!sendMessageResponse.ok) {
      composer.setError(
        sendMessageResponse.problem.detail ?? sendMessageResponse.problem.title
      );
      e.target.disabled = false;
      return;
    }
    modal.hide();
    e.target.disabled = false;
  };
  modal.show();
});

const puzzleGridColumnDefinitions = [
  {
    fieldName: "puzzleName",
    title: "Puzzle Name",
  },
  {
    fieldName: "displayName",
    title: "Display Name",
  },
  {
    fieldName: "solutionDisplayText",
    title: "Solution",
  },
  {
    fieldName: "nextHintToDisplay",
    title: "Next Hint Number",
  },
  {
    fieldName: "statusDescription",
    title: "Status",
  },
  {
    fieldName: "activationCode",
    title: "Activation Code",
  },
];
const puzzleGridOptions = {
  allowCreation: false,
  allowRowDeleting: false,
  allowRowEditing: false,
  allowRowReordering: false,
  allowRowSelecting: false,
};
const puzzleGrid = new DataGrid(
  "Puzzles",
  puzzleGridColumnDefinitions,
  puzzleGridOptions
);
puzzleGrid.render(quest.puzzles);
const gridElement = puzzleGrid.getElement();
addGeneratorButtons(gridElement);
document.querySelector("#puzzles").replaceChildren(gridElement);
