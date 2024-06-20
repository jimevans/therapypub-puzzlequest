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
