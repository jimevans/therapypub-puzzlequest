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
      body: JSON.stringify(data)
    });
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if ("error" in responseData) {
        console.log(
          `${response.status} received with error ${responseData.error}`
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
      body: data
    });
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if ("error" in responseData) {
        console.log(
          `${response.status} received with error ${responseData.error}`
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
  const puzzleData = {
    name: document.querySelector("#puzzle-name").value,
    displayName: document.querySelector("#display-name").value,
    type: parseInt(document.querySelector("#puzzle-type").value),
    solutionKeyword: document.querySelector("#solution-keyword").value,
    solutionDisplayText: document.querySelector("#solution-display-text").value
  };
  if (puzzleData.type === 0) {
    puzzleData.text = renderer.getPuzzleData();
  }
  return puzzleData;
}

const renderer = new PuzzleRenderer();
renderer.render(puzzle?.type, puzzle?.content, renderMode !== "display");
document.querySelector("#puzzle-content").replaceChildren(renderer.getElement());

if (renderMode === "display") {
  document.querySelector("#edit").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/puzzle/${puzzle.name}/edit`;
  });
} else if (renderMode === "edit") {
  document.querySelector("#puzzle-type").addEventListener("change", (e) => {
    renderer.render(parseInt(e.target.value), "", true);
  });
  document.querySelector("#save").addEventListener("click", async (e) => {
    e.preventDefault();
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
      uploadData.append("fileExtension", fileName.substring(fileName.lastIndexOf(".") + 1));
      uploadData.append("binary", renderedPuzzleData);
      const uploadResponse = await uploadBinary(uploadData);
      if ("error" in uploadResponse) {
        showError(`An error occurred uploading the binary data: ${uploadResponse.error}`);
        return;
      }
      puzzleData.text = uploadResponse.location;
    } else {
      puzzleData.text = renderedPuzzleData;
    }

    const dataReturn = await callDataApi(`/api/puzzle/${puzzleData.name}`, "put", puzzleData);
    if ("error" in dataReturn) {
      showError(dataReturn.error);
      return;
    }
    window.location.href = "/";
  });
  document.querySelector("#cancel").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/puzzle/${userName}`;
  });
} else if (renderMode === "create") {
  document.querySelector("#puzzle-type").addEventListener("change", (e) => {
    renderer.render(parseInt(e.target.value), "", true);
  });
  document.querySelector("#save").addEventListener("click", async (e) => {
    e.preventDefault();
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
      uploadData.append("fileExtension", fileName.substring(fileName.lastIndexOf(".") + 1));
      uploadData.append("binary", renderedPuzzleData);
      const uploadResponse = await uploadBinary(uploadData);
      if ("error" in uploadResponse) {
        showError(`An error occurred uploading the binary data: ${uploadResponse.error}`);
        return;
      }
      puzzleData.text = uploadResponse.location;
    } else {
      puzzleData.text = renderedPuzzleData;
    }

    const dataReturn = await callDataApi("/api/puzzle/create", "post", puzzleData);
    if ("error" in dataReturn) {
      showError(dataReturn.error);
      return;
    }
    window.location.href = "/";
  });
  document.querySelector("#cancel").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/";
  });
}
