/* global renderMode, puzzle -- defined by an inline script in the page */
import { DataGrid } from "./components/grid.js";
import { PuzzleRenderer } from "./components/puzzleRenderer.js";
import { callApi } from "./api.js";

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

async function uploadBinary(data) {
  return await callApi("/puzzle-media", { method: "POST", formData: data });
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

async function savePuzzle() {
  clearError();
  const puzzleData = getPuzzleData();
  const dataErrors = validateInput(puzzleData, renderMode);
  if (dataErrors.length) {
    showError(dataErrors.join(", "));
    return;
  }

  const renderedPuzzleData = renderer.getPuzzleData();
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
    if (!uploadResponse.ok) {
      showError(
        `The file could not be uploaded: ${uploadResponse.problem.detail ?? uploadResponse.problem.title}`
      );
      return false;
    }
    puzzleData.text = uploadResponse.data.path;
  } else if (renderedPuzzleData !== null) {
    puzzleData.text = renderedPuzzleData;
  } else {
    // A media puzzle whose file wasn't changed keeps its file.
    delete puzzleData.text;
  }

  const response =
    renderMode === "edit"
      ? await callApi(`/puzzles/${encodeURIComponent(puzzleData.name)}`, {
          method: "PATCH",
          body: puzzleData,
        })
      : await callApi("/puzzles", { method: "POST", body: puzzleData });
  if (!response.ok) {
    showError(response.problem.detail ?? response.problem.title);
    return false;
  }
  return true;
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
  allowRowSelecting: false,
};

const columnDefinitions = [
  {
    fieldName: "text",
    title: "Hint Text",
    editable: true,
  },
  {
    fieldName: "solutionWarning",
    title: "Does Hint Give Solution?",
    type: "boolean",
    editable: true,
  },
  {
    fieldName: "timePenalty",
    title: "Time Penalty (sec)",
    editable: true,
  },
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
    timePenalty: 0,
  });
  hintGrid.editDataRow(rowCount);
};

hintGrid.render(puzzle ? puzzle.hints : []);
document.querySelector("#hints").replaceChildren(hintGrid.getElement());

document.querySelector("#puzzle-type").addEventListener("change", (e) => {
  renderer.render(parseInt(e.target.value), "", true);
});
document.querySelector("#save-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (await savePuzzle()) {
    window.location.href = e.target.href;
  }
});
document.querySelector("#save-button").addEventListener("click", async (e) => {
  const returnUrl = e.currentTarget.href;
  e.preventDefault();
  if (await savePuzzle()) {
    window.location.href = returnUrl;
  }
});
