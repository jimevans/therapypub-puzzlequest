import { PuzzleModel as Puzzle, PuzzleType } from "../models/puzzle.model.js";

export async function getPuzzleByPuzzleName(name) {
  const puzzle = await Puzzle.findOne({ name: name });
  if (puzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with puzzle name ${name} found`
    };
  }
  return { status: "success", statusCode: 200, data: puzzle };
}

export async function deletePuzzle(name) {
  const result = await Puzzle.findOneAndDelete({ name: name });
  if (result === null) {
    return {
      status: error,
      statusCode: 404,
      message: `Puzzle with puzzle name ${name} does not exist`
    };
  }
  return { status: "success", statusCode: 200 };
}

export async function createPuzzle(puzzle) {
  const existingPuzzles = await Puzzle.find({ name: puzzle.name }).lean();
  const puzzleExists = existingPuzzles.length !== 0;
  if (puzzleExists) {
    return {
      status: error,
      statusCode: 400,
      message: `Puzzle with puzzle name ${puzzle.name} already exists`
    };
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
    return {
      status: "error",
      statusCode: 500,
      message: `New puzzle not created - ${err}`
    };
  }
  return { status: "success", statusCode: 200 };
}

export async function updatePuzzle(name, puzzleData) {
  const foundPuzzle = await Puzzle.findOne({ name: name });
  if (foundPuzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with puzzle name ${name} found`
    };
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
  return { status: "success", statusCode: 200 };
}

export async function listPuzzles() {
  const puzzles = await Puzzle.find({});
  return { status: "success", statusCode: 200, data: puzzles };
}
