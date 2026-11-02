import { PuzzleModel, PuzzleType } from "../models/puzzle.model.js";
import type { ServiceResult } from "../types.js";

/**
 * The result of a puzzle service operation; data is a Puzzle unless the
 * function's documentation says otherwise.
 */
export type PuzzleResult<T = Puzzle> = ServiceResult<T>;

/**
 * A data class describing a puzzle hint.
 */
export class PuzzleHint {
  /**
   * Gets or sets the text of the puzzle hint.
   */
  text: string;

  /**
   * Gets or sets a value indicating whether the hint would reveal the puzzle solution
   */
  solutionWarning: boolean;

  /**
   * Gets or sets the time penalty in seconds that revealing the hint costs the player.
   */
  timePenalty: number;

  /**
   * Initializes a new instance of the PuzzleHint class.
   * @param hintDefinition an object containing the definition of hint properties
   */
  constructor(hintDefinition: Partial<PuzzleHint>) {
    this.text = hintDefinition.text;
    this.solutionWarning = hintDefinition.solutionWarning;
    this.timePenalty = hintDefinition.timePenalty;
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this PuzzleHint.
   * @returns the object to be serialized to JSON
   */
  toJSON(): object {
    return {
      text: this.text,
      solutionWarning: this.solutionWarning,
      timePenalty: this.timePenalty,
    };
  }
}

export class Puzzle {
  /**
   * Gets or sets the unique name of the puzzle.
   */
  name: string;

  /**
   * Gets or sets the display name of the puzzle.
   */
  displayName: string;

  /**
   * Gets or sets the type of puzzle.
   */
  type: number;

  /**
   * Gets or sets the text of the puzzle.
   */
  text: string;

  /**
   * Gets or sets a comma-delimited list of keywords a solution guess must
   * contain to be a correct solution to the puzzle.
   */
  solutionKeyword: string;

  /**
   * Gets or sets the display text for the solution of the puzzle.
   */
  solutionDisplayText: string;

  /**
   * Gets or sets the list of hints for this puzzle.
   */
  hints: PuzzleHint[] = [];

  /**
   * Initializes a new instance of the Puzzle class.
   * @param puzzleDefinition an object containing the definition of puzzle properties
   */
  constructor(puzzleDefinition: Partial<Puzzle>) {
    this.name = puzzleDefinition.name;
    this.displayName = puzzleDefinition.displayName;
    this.type = puzzleDefinition.type;
    this.text = puzzleDefinition.text;
    this.solutionKeyword = puzzleDefinition.solutionKeyword;
    this.solutionDisplayText = puzzleDefinition.solutionDisplayText;
    if (puzzleDefinition.hints) {
      this.hints = puzzleDefinition.hints.map((hint) => new PuzzleHint(hint));
    }
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this Puzzle.
   * @returns the object to be serialized to JSON
   */
  toJSON(): object {
    return {
      name: this.name,
      displayName: this.displayName,
      type: this.type,
      text: this.text,
      solutionKeyword: this.solutionKeyword,
      solutionDisplayText: this.solutionDisplayText,
      hints: this.hints,
    };
  }
}

/**
 * Gets a puzzle by its puzzle name.
 * @param name the name of the puzzle to get
 * @returns a response object containing a status, status code, and data
 */
export async function getPuzzleByPuzzleName(
  name: string
): Promise<PuzzleResult> {
  const foundPuzzle = await PuzzleModel.findOne({ name: name });
  if (foundPuzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with puzzle name ${name} found`,
    };
  }
  const puzzle = new Puzzle(foundPuzzle);
  if (foundPuzzle.hints) {
    puzzle.hints = foundPuzzle.hints.map((hint) => new PuzzleHint(hint));
  }
  return { status: "success", statusCode: 200, data: puzzle };
}

/**
 * Deletes a puzzle by its puzzle name.
 * @param name the name of the puzzle to delete
 * @returns a response object containing a status, status code, and data
 */
export async function deletePuzzle(name: string): Promise<PuzzleResult> {
  const result = await PuzzleModel.findOneAndDelete({ name: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `Puzzle with puzzle name ${name} does not exist`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new puzzle.
 * @param puzzle the definition of the puzzle to create
 * @returns a response object containing a status, status code, and data
 */
export async function createPuzzle(puzzle: Puzzle): Promise<PuzzleResult> {
  const existingPuzzles = await PuzzleModel.find({ name: puzzle.name }).lean();
  const puzzleExists = existingPuzzles.length !== 0;
  if (puzzleExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `Puzzle with puzzle name ${puzzle.name} already exists`,
    };
  }

  try {
    const newPuzzle = new PuzzleModel({
      name: puzzle.name,
      displayName: puzzle.displayName || puzzle.name,
      type: puzzle.type || PuzzleType.TEXT,
      text: puzzle.text || "",
      solutionKeyword: puzzle.solutionKeyword || "",
      solutionDisplayText: puzzle.solutionDisplayText || "",
      hints: puzzle.hints || [],
    });
    await newPuzzle.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `New puzzle not created - ${err}`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a puzzle.
 * @param name the name of the puzzle to update
 * @param puzzleData the data to update the puzzle definition with
 * @returns a response object containing a status, status code, and data
 */
export async function updatePuzzle(
  name: string,
  puzzleData: Puzzle
): Promise<PuzzleResult> {
  const foundPuzzle = await PuzzleModel.findOne({ name: name });
  if (foundPuzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with puzzle name ${name} found`,
    };
  }
  foundPuzzle.displayName = puzzleData.displayName || foundPuzzle.displayName;
  foundPuzzle.type = puzzleData.type || foundPuzzle.type;
  foundPuzzle.text = puzzleData.text || foundPuzzle.text;
  foundPuzzle.solutionKeyword =
    puzzleData.solutionKeyword || foundPuzzle.solutionKeyword;
  foundPuzzle.solutionDisplayText =
    puzzleData.solutionDisplayText || foundPuzzle.solutionDisplayText;
  foundPuzzle.set("hints", puzzleData.hints || foundPuzzle.hints);
  await foundPuzzle.save();
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a list of all of the puzzle definitions.
 * @returns a response object containing a status, status code, and data
 */
export async function listPuzzles(): Promise<PuzzleResult<Puzzle[]>> {
  const foundPuzzles = await PuzzleModel.find({});
  const puzzles = foundPuzzles.map((foundPuzzle) => {
    const puzzle = new Puzzle(foundPuzzle);
    puzzle.hints = foundPuzzle.hints.map((hint) => new PuzzleHint(hint));
    return puzzle;
  });
  return { status: "success", statusCode: 200, data: puzzles };
}
