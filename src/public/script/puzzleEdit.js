import { DataGrid } from "./components/grid.js";
import { PuzzleRenderer } from "./components/puzzleRenderer.js";

function clearError() {
  const errorNotifier = document.querySelector(".pq-error");
  const errorMessage = errorNotifier.querySelector("span");
  errorNotifier.classList.add("pq-hide");
  errorMessage.innerText = "";
}

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  const errorDisplay = errorNotifier.querySelector("span");
  errorDisplay.innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

async function callDataApi(apiEndPoint, method, data) {
  try {
    const response = await fetch(apiEndPoint, {
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
      return responseData;
    }
  } catch (err) {
    console.log("error: " + err);
  }
}

async function uploadBinary(data) {
  try {
    const response = await fetch("/api/puzzle/upload", {
      method: "post",
      body: data,
    });
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
      return responseData;
    }
  } catch (err) {
    console.log("error: " + err);
  }
}

function validateInput(puzzleData) {
  const dataErrors = [];
  if (puzzleData.name === "") {
    dataErrors.push("user name cannot be empty");
  }
  if (puzzleData.displayName === "") {
    dataErrors.push("display name cannot be empty");
  }
  if (puzzleData.solutionKeyword === "") {
    dataErrors.push("solution keyword cannot be empty");
  }
  if (puzzleData.solutionDisplayText === "") {
    dataErrors.push("solution display text cannot be empty");
  }
  return dataErrors;
}

function getPuzzleData() {
  const puzzleName =
    renderMode === "create"
      ? document.querySelector("#puzzle-name").value
      : puzzle.name;
  const puzzleData = {
    name: puzzleName,
    displayName: document.querySelector("#display-name").value,
    type: parseInt(document.querySelector("#puzzle-type").value),
    solutionKeyword: document.querySelector("#solution-keyword").value,
    solutionDisplayText: document.querySelector("#solution-display-text").value,
  };
  if (puzzleData.type === 0) {
    puzzleData.text = renderer.getPuzzleData();
  }
  puzzleData.hints = hintGrid.getData();
  return puzzleData;
}

const renderer = new PuzzleRenderer();
renderer.render(puzzle?.type, puzzle?.content, true);
document
  .querySelector("#puzzle-content")
  .replaceChildren(renderer.getElement());


const hintGridOptions = {
  allowCreation: true,
  allowRowDeleting: true,
  allowRowEditing: true,
  allowRowReordering: true,
  allowRowSelecting: false
};

const columnDefinitions = [
  {
    fieldName: "text",
    title: "Hint Text",
    editable: true
  },
  {
    fieldName: "solutionWarning",
    title: "Does Hint Give Solution?",
    type: "boolean",
    editable: true
  },
  {
    fieldName: "timePenalty",
    title: "Time Penalty (sec)",
    editable: true
  }
];

const hintGrid = new DataGrid("Hints", columnDefinitions, hintGridOptions);
hintGrid.setAddNewDataLinkText("Add hint");
hintGrid.onDeleteDataRequested = (e) => {
  hintGrid.deleteDataRow(e.currentTarget.parentNode.parentNode.rowIndex - 1);
};
hintGrid.onRowEditRequested = (e) => {
  hintGrid.editDataRow(e.currentTarget.parentNode.parentNode.rowIndex - 1);
};
hintGrid.onAddDataRequested = (e) => {
  const rowCount = hintGrid.getDataRowCount();
  hintGrid.addDataRow({
    text: "",
    solutionWarning: false,
    timePenalty: 0
  });
  hintGrid.editDataRow(rowCount);
}

hintGrid.render(puzzle ? puzzle.hints : []);
document.querySelector("#hints").replaceChildren(hintGrid.getElement());


document.querySelector("#puzzle-type").addEventListener("change", (e) => {
  renderer.render(parseInt(e.target.value), "", true);
});
document.querySelector("#cancel").addEventListener("click", (e) => {
  e.preventDefault();
  if (puzzle) {
    window.location.href = `/puzzle/${puzzle.name}`;
  } else {
    window.location.href = "/";
  }
});
document.querySelector("#save").addEventListener("click", async (e) => {
  e.preventDefault();
  clearError();
  const puzzleData = getPuzzleData();
  const dataErrors = validateInput(puzzleData, renderMode);
  if (dataErrors.length) {
    showError(dataErrors.join(", "));
    return;
  }

  const renderedPuzzleData = renderer.getPuzzleData();
  const dataApiVerb = renderMode === "edit" ? "put" : "post";
  const dataApiUrl =
    renderMode === "edit"
      ? `/api/puzzle/${puzzleData.name}`
      : `/api/puzzle/create`;
  if (puzzleData.type !== 0 && renderedPuzzleData !== null) {
    const fileName = renderedPuzzleData.name;

    const uploadData = new FormData();
    uploadData.append("puzzleName", puzzleData.name);
    uploadData.append(
      "fileExtension",
      fileName.substring(fileName.lastIndexOf(".") + 1)
    );
    uploadData.append("binary", renderedPuzzleData);
    const uploadResponse = await uploadBinary(uploadData);
    if (uploadResponse.status === "error") {
      showError(
        `An error occurred uploading the binary data: ${uploadResponse.message}`
      );
      return;
    }
    puzzleData.text = uploadResponse.location;
  } else {
    puzzleData.text = renderedPuzzleData;
  }

  const dataReturn = await callDataApi(dataApiUrl, dataApiVerb, puzzleData);
  if (dataReturn.status === "error") {
    showError(dataReturn.message);
    return;
  }
  window.location.href = "/";
});
