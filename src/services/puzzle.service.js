import { PuzzleModel, PuzzleType } from "../models/puzzle.model.js";

/**
 * @typedef {Object} PuzzleResult
 * @property {string} status the status of the operation
 * @property {number} statusCode the numeric status code of the operation
 * @property {string | undefined} message text of a message describing the result, especially in an error condition
 * @property {Puzzle | Puzzle[] | undefined} data the user returned in the result
 */

/**
 * A data class describing a puzzle hint.
 */
export class PuzzleHint {
  /**
   * Gets or sets the text of the puzzle hint.
   * @type {string}
   */
  text;

  /**
   * Gets or sets a value indicating whether the hint would reveal the puzzle solution
   * @type {boolean}
   */
  solutionWarning;

  /**
   * Gets or sets the time penalty in seconds that revealing the hint costs the player.
   */
  timePenalty;

  /**
   * Initializes a new instance of the PuzzleHint class.
   * @param {object} hintDefinition an object containing the definition of hint properties
   */
  constructor(hintDefinition) {
    this.text = hintDefinition.text;
    this.solutionWarning = hintDefinition.solutionWarning;
    this.timePenalty = hintDefinition.timePenalty;
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this PuzzleHint.
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    return {
      text: this.text,
      solutionWarning: this.solutionWarning,
      timePenalty: this.timePenalty
    }
  }
}

export class Puzzle {
  /**
   * Gets or sets the unique name of the puzzle.
   * @type {string}
   */
  name;

  /**
   * Gets or sets the display name of the puzzle.
   * @type {string}
   */
  displayName;

  /**
   * Gets or sets the type of puzzle.
   * @type {number}
   */
  type;

  /**
   * Gets or sets the text of the puzzle.
   * @type {string}
   */
  text;

  /**
   * Gets or sets a comma-delimited list of keywords a solution guess must
   * contain to be a correct solution to the puzzle.
   * @type {string}
   */
  solutionKeyword;

  /**
   * Gets or sets the display text for the solution of the puzzle.
   * @type {string}
   */
  solutionDisplayText;

  /**
   * Gets or sets the list of hints for this puzzle.
   * @type {PuzzleHint[]}
   */
  hints = []

  /**
   * Initializes a new instance of the Puzzle class.
   * @param {object} puzzleDefinition  an object containing the definition of puzzle properties
   */
  constructor(puzzleDefinition) {
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
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    return {
      name: this.name,
      displayName: this.displayName,
      type: this.type,
      text: this.text,
      solutionKeyword: this.solutionKeyword,
      solutionDisplayText: this.solutionDisplayText,
      hints: this.hints
    };
  }
}

/**
 * Gets a puzzle by its puzzle name.
 * @param {string} name the name of the puzzle to get
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function getPuzzleByPuzzleName(name) {
  const foundPuzzle = await PuzzleModel.findOne({ name: name });
  if (foundPuzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with puzzle name ${name} found`
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
 * @param {string} name the name of the puzzle to delete
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function deletePuzzle(name) {
  const result = await PuzzleModel.findOneAndDelete({ name: name });
  if (result === null) {
    return {
      status: error,
      statusCode: 404,
      message: `Puzzle with puzzle name ${name} does not exist`
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new puzzle.
 * @param {Puzzle} puzzle the definition of the puzzle to create
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function createPuzzle(puzzle) {
  const existingPuzzles = await PuzzleModel.find({ name: puzzle.name }).lean();
  const puzzleExists = existingPuzzles.length !== 0;
  if (puzzleExists) {
    return {
      status: error,
      statusCode: 400,
      message: `Puzzle with puzzle name ${puzzle.name} already exists`
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
      resourcePath: puzzle.resourcePath || "",
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

/**
 * Updates a puzzle.
 * @param {string} name the name of the puzzle to update
 * @param {Puzzle} puzzleData the data to update the puzzle definition with
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function updatePuzzle(name, puzzleData) {
  const foundPuzzle = await PuzzleModel.findOne({ name: name });
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
  foundPuzzle.hints = puzzleData.hints || foundPuzzle.hints;
  await foundPuzzle.save();
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a list of all of the puzzle definitions.
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function listPuzzles() {
  const foundPuzzles = await PuzzleModel.find({});
  const puzzles = foundPuzzles.map((foundPuzzle) => {
    const puzzle = new Puzzle(foundPuzzle);
    puzzle.hints = foundPuzzle.hints.map((hint) => new PuzzleHint(hint));
    return puzzle;
  });
  return { status: "success", statusCode: 200, data: puzzles };
}
