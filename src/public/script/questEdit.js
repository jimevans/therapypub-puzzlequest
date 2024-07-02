import { DataGrid } from "./components/grid.js";
import { Lookup } from "./components/lookup.js";

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

const puzzleGrid = new DataGrid();
puzzleGrid.allowCreation = true;
puzzleGrid.allowRowDeleting = true;
puzzleGrid.allowRowEditing = true;
puzzleGrid.allowRowReordering = true;
puzzleGrid.allowRowSelecting = false;
const columnDefinitions = [
  {
    fieldName: "name",
    title: "Puzzle Name",
  },
  {
    fieldName: "nextHintToDisplay",
    title: "Next Hint Number"
  },
  {
    fieldName: "status",
    title: "Status"
  }
];
puzzleGrid.initialize("Quest Puzzles", columnDefinitions, quest ? quest.puzzles : []);

puzzleGrid.onAddDataRequested = () => {
  const puzzleLookup = new Lookup();
  puzzleLookup.onConfirmButtonClick = (e) => {
    const selectedPuzzles = puzzleLookup.getSelectedData();
    puzzleLookup.hide();
    selectedPuzzles.forEach((puzzle) => {
      const questPuzzle = {
        name: puzzle.name,
        nextHintToDisplay: 0,
        status: 0
      }
      puzzleGrid.addDataRow(questPuzzle, columnDefinitions);
    });
  }

   const lookupColumnDefinitions = [
    {
      fieldName: "name",
      title: "Puzzle name"
    },
    {
      fieldName: "displayName",
      title: "Display name"
    },
    {
      fieldName: "solutionText",
      title: "Solution text"
    }
  ];
  puzzleLookup.initialize("Puzzles", "/api/puzzle/list", "puzzles", lookupColumnDefinitions);
  puzzleLookup.show();
}

document.querySelector("#set-user-button").addEventListener("click", (e) => {
  e.stopPropagation();
  const userLookup = new Lookup();
  userLookup.onConfirmButtonClick = (e) => {
    const selectedUser = userLookup.getSelectedData();
    userLookup.hide();
  }

   const lookupColumnDefinitions = [
    {
      fieldName: "userName",
      title: "User name"
    },
    {
      fieldName: "displayName",
      title: "Display name"
    }
  ];
  userLookup.initialize("Users", "/api/user/list", "users", lookupColumnDefinitions);
  userLookup.show();

});

document.querySelector("#quest-puzzles").replaceChildren(puzzleGrid.getElement());
