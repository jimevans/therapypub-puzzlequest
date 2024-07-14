import { DataGrid } from "./components/grid.js";

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

document.querySelector("#edit").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/quest/${quest.name}/edit`;
});
document.querySelector("#close").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/`;
});
document.querySelector("#activate")?.addEventListener("click", async (e) => {
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
  }
  window.location.href = "/";
});
document.querySelector("#reset")?.addEventListener("click", async (e) => {
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
  }
  window.location.href = "/";
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
