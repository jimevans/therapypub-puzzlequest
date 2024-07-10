import { DataGrid } from "./components/grid.js";

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
  try {
    const response = await fetch(`/api/quest/${quest.name}/activate`, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: "",
    });
    if (response.ok) {
      const returnedData = await response.json();
      if (returnedData.status !== "success") {
        console.log(`unexpected error: ${returnedData.message}`);
      }
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
    }
  } catch (err) {
    console.log("error: " + err);
  }
  window.location.href = "/";
});
document.querySelector("#reset")?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const response = await fetch(`/api/quest/${quest.name}/reset`, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: "",
    });
    if (response.ok) {
      const returnedData = await response.json();
      if (returnedData.status !== "success") {
        console.log(`unexpected error: ${returnedData.message}`);
      }
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
    }
  } catch (err) {
    console.log("error: " + err.message);
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
    title: "Display Name"
  },
  {
    fieldName: "solutionDisplayText",
    title: "Solution"
  },
  {
    fieldName: "nextHintToDisplay",
    title: "Next Hint Number"
  },
  {
    fieldName: "statusDescription",
    title: "Status"
  },
  {
    fieldName: "activationCode",
    title: "Activation Code"
  }
]
const puzzleGridOptions = {
  allowCreation: false,
  allowRowDeleting: false,
  allowRowEditing: false,
  allowRowReordering: false,
  allowRowSelecting: false
}
const puzzleGrid = new DataGrid("Puzzles", puzzleGridColumnDefinitions, puzzleGridOptions);
puzzleGrid.render(quest.puzzles);
document.querySelector("#puzzles").replaceChildren(puzzleGrid.getElement());
