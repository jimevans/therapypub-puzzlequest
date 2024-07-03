import { DataGrid } from "./components/grid.js";

document.querySelector("#edit").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/quest/${quest.name}/edit`;
});
document.querySelector("#close").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/`;
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
