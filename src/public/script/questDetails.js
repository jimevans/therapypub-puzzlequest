import { DataGrid } from "./components/grid.js";
import { Modal } from "./components/modal.js";
import { TextMessageComposer } from "./components/textMessageComposer.js";

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
    const puzzleName = row.querySelector("td[data-field-name='name']").innerText;
    const qrGenerationLink = document.createElement("a");
    qrGenerationLink.classList.add("pq-icon-link");
    qrGenerationLink.href = `/quest/${quest.name}/puzzle/${puzzleName}/qrCode`;
    qrGenerationLink.appendChild(svgElement);
    cell.appendChild(qrGenerationLink);
  });
}

async function callDataApi(dataUrl, method, body = undefined) {
  const fetchOptions = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(dataUrl, fetchOptions);
    if (!response.ok) {
      console.log(`${response.status} received calling URL ${dataUrl}`);
    }
    return await response.json();
  } catch (err) {
    console.log("error: " + err.message);
  }
}

document.querySelector("#activate-link")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const activationResponse = await callDataApi(
    `/api/quest/${quest.name}/activate`,
    "put",
    {}
  );
  if (activationResponse.status === "error") {
    console.log(
      `Error received activating quest: ${activationResponse.message}`
    );
    return;
  }
  window.location.href = e.target.href;
});

document.querySelector("#reset-link")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const resetResponse = await callDataApi(
    `/api/quest/${quest.name}/reset`,
    "put",
    {}
  );
  if (resetResponse.status === "error") {
    console.log(
      `Error received resetting quest ${resetResponse.message}`
    );
    return;
  }
  window.location.href = e.target.href;
});

document.querySelector("#notify-link")?.addEventListener("click", (e) => {
  e.preventDefault();
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
    const messagePayload = {
      questName: quest.name,
      message: message
    }
    if (expectedResponse) {
      if (!responseConfirmation) {
        composer.setError("An expected response requires a response confirmation");
        return;
      }
      messagePayload.expectedResponse = expectedResponse;
      messagePayload.responseConfirmation = responseConfirmation;
    }
    const sendMessageResponse = await callDataApi(
      "/api/messaging/outgoing/text",
      "post",
      messagePayload);
    if (sendMessageResponse.status === "error") {
      composer.setError(sendMessageResponse.message);
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
    fieldName: "name",
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
