import { PuzzleModel as Puzzle, PuzzleType } from "../models/puzzle.model.js";

export async function getPuzzleByPuzzleName(name) {
  const puzzle = await Puzzle.findOne({ name: name });
  if (puzzle === null) {
    return { error: `No puzzle with puzzle name ${name} found` };
  }
  return { status: "success", puzzle: puzzle };
}

export async function deletePuzzle(name) {
  const result = await Puzzle.findOneAndDelete({ name: name });
  if (result === null) {
    return { error: `Puzzle with puzzle name ${name} does not exist` };
  }
  return { status: "success" };
}

export async function createPuzzle(puzzle) {
  const existingPuzzles = await Puzzle.find({ name: puzzle.name }).lean();
  const puzzleExists = existingPuzzles.length !== 0;
  if (puzzleExists) {
    return { error: `Puzzle with puzzle name ${puzzle.name} already exists` };
  }

  try {
    const newPuzzle = new Puzzle({
      name: puzzle.name,
      displayName: puzzle.displayName || puzzle.name,
      type: puzzle.type || PuzzleType.TEXT,
      text: puzzle.text || "",
      solutionKeyword: puzzle.solutionKeyword || "",
      solutionDisplayText: puzzle.solutionDisplayText || "",
      resourcePath: puzzle.resourcePath || "",
      activationCode: puzzle.activationCode || "",
      hints: puzzle.hints || [],
    });
    await newPuzzle.save();
  } catch (err) {
    return { error: `New puzzle not created - ${err}` };
  }
  return { status: "success" };
}

export async function updatePuzzle(name, puzzleData) {
  const foundPuzzle = await Puzzle.findOne({ name: name });
  if (foundPuzzle === null) {
    return { error: `No puzzle with puzzle name ${name} found` };
  }
  foundPuzzle.displayName = puzzleData.displayName || foundPuzzle.displayName;
  foundPuzzle.type = puzzleData.type || foundPuzzle.type;
  foundPuzzle.text = puzzleData.text || foundPuzzle.text;
  foundPuzzle.solutionKeyword = puzzleData.solutionKeyword || foundPuzzle.solutionKeyword;
  foundPuzzle.solutionDisplayText = puzzleData.solutionDisplayText || foundPuzzle.solutionDisplayText;
  foundPuzzle.resourcePath = puzzleData.resourcePath || foundPuzzle.resourcePath;
  foundPuzzle.activationCode = puzzleData.activationCode || foundPuzzle.activationCode;
  foundPuzzle.hints = puzzleData.hints || foundPuzzle.hints;
  await foundPuzzle.save();
  return { status: "success" };
}

export async function listPuzzles() {
  const puzzles = await Puzzle.find({});
  return { status: "success", puzzles: puzzles };
}
