import { DataGrid } from "./components/grid.js";
import { PuzzleRenderer } from "./components/puzzleRenderer.js";

const renderer = new PuzzleRenderer();
renderer.render(puzzle?.type, puzzle?.content, false);
document
  .querySelector("#puzzle-content")
  .replaceChildren(renderer.getElement());

document.querySelector("#edit").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/puzzle/${puzzle.name}/edit`;
});
document.querySelector("#close").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/`;
});

const hintGridColumnDefinitions = [
  {
    fieldName: "text",
    title: "Hint Text"
  },
  {
    fieldName: "solutionWarning",
    title: "Does Hint Give Solution?",
    type: "boolean"
  },
  {
    fieldName: "timePenalty",
    title: "Time Penalty (sec)"
  }
]
const hindGridOptions = {
  allowCreation: false,
  allowRowDeleting: false,
  allowRowEditing: false,
  allowRowReordering: false,
  allowRowSelecting: false
}
const hintGrid = new DataGrid("Hints", hintGridColumnDefinitions, hindGridOptions);
hintGrid.render(puzzle.hints);
document.querySelector("#hints").replaceChildren(hintGrid.getElement());
