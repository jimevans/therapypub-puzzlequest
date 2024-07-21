import { randomUUID } from "crypto";
import QRCode from "qrcode";
import {
  QuestModel as Quest,
  QuestStatus,
  QuestPuzzleStatus,
} from "../models/quest.model.js";
import * as PuzzleService from "./puzzle.service.js";
import * as UserService from "./user.service.js";

/**
 * Queries the data store for the quest with the given name, returning all puzzle data.
 * @param {string} name the name of the quest for which to retrieve the data
 * @returns {object} a response object containing a status, status code, and data
 */
async function queryForQuest(name) {
  const foundQuests = await Quest.aggregate([
    { $match: { name: name } },
    { $limit: 1 },
    {
      $lookup: {
        from: "puzzles",
        localField: "puzzles.puzzleName",
        foreignField: "name",
        as: "puzzleDetails",
      },
    },
  ]);
  if (foundQuests.length === 0) {
    return {
      status: "error",
      statusCode: 404,
      message: `no quest with name ${name}`,
    };
  }
  // We should only ever have one here, so take the 0th one.
  return { status: "success", statusCode: 200, data: foundQuests[0] };
}

/**
 * Creates a quest in the data store.
 * @param {object} questDefinition the definition of the quest to create.
 * @returns {object} a response object containing a status, status code, and data
 */
export async function createQuest(questDefinition) {
  let questName = "";
  if ("name" in questDefinition) {
    questName = questDefinition.name;
  } else if ("displayName" in questDefinition) {
    questName = questDefinition.displayName.replace(" ", ".").toLowerCase();
  } else {
    return {
      status: "error",
      statusCode: 400,
      message: "Quest definition must contain a name or display name",
    };
  }
  if (!("userName" in questDefinition)) {
    // NOTE: This could lead to attempting to add a user name that does
    // not exist. This is to avoid a lookup of the user from the Users schema.
    // Consumers of this service will have to take that into account when
    // managing the implications of creating a quest.
    return {
      status: "error",
      statusCode: 400,
      message: "Quest definition must contain a user name",
    };
  }
  const questExists = (await Quest.find({ name: questName })).length !== 0;
  if (questExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest with name ${questName} already exists`,
    };
  }
  const quest = new Quest({
    name: questName,
    displayName: questDefinition.displayName || questName,
    userName: questDefinition.userName,
    status: QuestStatus.NOT_STARTED,
    puzzles: [],
  });

  if ("puzzles" in questDefinition) {
    // NOTE: This could lead to attempting to add a puzzle name that does
    // not exist. This is to avoid a lookup of the puzzle from the Puzzles
    // schema. Consumers of this service will have to take that into account
    // when managing the implications of creating puzzles in a quest.
    let puzzleCount = 0;
    questDefinition.puzzles.forEach((puzzleDefinition) => {
      const puzzle = {
        puzzleName: puzzleDefinition.puzzleName,
        nextHintToDisplay: 0,
        status: QuestPuzzleStatus.UNAVAILABLE,
        activationCode: randomUUID().replaceAll("-", ""),
      };
      quest.puzzles.push(puzzle);
      puzzleCount++;
    });
  }
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Deletes a quest from the data store.
 * @param {string} name the name of the quest to delete
 * @returns {object} a response object containing a status, status code, and data
 */
export async function deleteQuest(name) {
  const result = await Quest.findOneAndDelete({ name: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `Quest with name ${name} does not exist`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a quest in the data store.
 * @param {string} name name of the quest to update
 * @param {object} questDefinition quest definition containing the updated data
 * @returns {object} a response object containing a status, status code, and data
 */
export async function updateQuest(name, questDefinition) {
  const foundQuest = await Quest.findOne({ name: name });
  if (foundQuest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${name} found`,
    };
  }
  if (questDefinition.name || questDefinition.displayName) {
    foundQuest.name =
      questDefinition.name ||
      questDefinition.displayName.replace(" ", ".").toLowerCase();
    foundQuest.displayName =
      questDefinition.displayName || questDefinition.name;
  }
  foundQuest.userName = questDefinition.userName || foundQuest.userName;
  foundQuest.status = questDefinition.status || foundQuest.status;
  if (questDefinition.puzzles.length) {
    foundQuest.puzzles = [];
    questDefinition.puzzles.forEach((puzzle) => {
      if (!puzzle.activationCode) {
        puzzle.activationCode = randomUUID().replaceAll("-", "");
      }
      foundQuest.puzzles.push(puzzle);
    });
  }
  foundQuest.puzzles = questDefinition.puzzles || foundQuest.puzzles;
  try {
    await foundQuest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err.message };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets quests in the data store.
 * @param {string} userName an object representing the user for which to get quests; if null, matches all users
 * @param {number} status status to retrieve any quests with status greater than or equal to; if -1, matches all statuses
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getQuests(userName = null, status = -1) {
  const questFilter = {};
  if (status >= QuestStatus.NOT_STARTED) {
    questFilter.status = { $gte: status };
  }
  if (userName) {
    const userNameResponse = await UserService.getUserInfo(userName);
    if (userNameResponse.status === "error") {
      return userNameResponse;
    }
    const validUsers = userNameResponse.data.teams.map(
      (identifier) => identifier.teamName
    );
    validUsers.push(userName);
    questFilter.userName = { $in: validUsers };
  }
  const foundQuests = await Quest.find(questFilter);
  return { status: "success", statusCode: 200, data: foundQuests };
}

/**
 * Gets a value indicating whether a quest is valid for a user.
 * @param {string} questName the name of the quest to check for user access
 * @param {string} userName the name of the user or team for which to check the quest validity
 * @returns a response object
 */
export async function isQuestForUser(questName, userName) {
  const questResponse = await getQuest(questName);
  if (!questResponse.data) {
    return { status: "success", statusCode: 200, data: false };
  }
  const quest = questResponse.data;
  const userNameResponse = await UserService.getUserInfo(userName);
  if (userNameResponse.status === "error") {
    // Getting an error on getting the users and teams can be ignored;
    // it just means we return false.
    return { status: "success", statusCode: 200, data: false };
  }
  const userAndTeams = userNameResponse.data.teams.map(
    (identifier) => identifier.teamName
  );
  userAndTeams.push(userName);
  const isQuestForUser = userAndTeams.includes(quest.userName);
  return {
    status: "success",
    statusCode: 200,
    data: {
      isQuestForUser: isQuestForUser,
      quest: isQuestForUser ? quest : null,
    },
  };
}

/**
 * Gets a read-only copy of a quest, including all puzzle data.
 * @param {string} name the name of the quest to retrieve data for
 * @param {boolean} omitUnavailablePuzzles true to omit puzzles unavailable to the user in the retrieved quest; otherwise, false
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getQuest(name, omitUnavailablePuzzles = false) {
  const queryResponse = await queryForQuest(name);
  if (queryResponse.status === "error") {
    return { status: "success", statusCode: 200, data: null };
  }

  const foundQuest = queryResponse.data;
  const questData = {
    name: foundQuest.name,
    displayName: foundQuest.displayName,
    userName: foundQuest.userName,
    status: foundQuest.status,
    puzzles: [],
  };
  const foundPuzzles = foundQuest.puzzles.filter((puzzle) => {
    if (
      !omitUnavailablePuzzles ||
      (omitUnavailablePuzzles &&
        puzzle.status >= QuestPuzzleStatus.AWAITING_ACTIVATION)
    ) {
      return puzzle;
    }
  });
  foundPuzzles.forEach((puzzle) => {
    let statusDescription = "";
    switch (puzzle.status) {
      case QuestPuzzleStatus.AWAITING_ACTIVATION:
        statusDescription = "Awaiting activation";
        break;
      case QuestPuzzleStatus.IN_PROGRESS:
        statusDescription = "In progress";
        break;
      case QuestPuzzleStatus.COMPLETED:
        statusDescription = "Completed";
        break;
      default:
        statusDescription = "Unavailable";
        break;
    }
    const detail = foundQuest.puzzleDetails.filter(
      (puzzleDetail) => puzzle.puzzleName === puzzleDetail.name
    )[0];
    const hints = detail.hints.slice(0, puzzle.nextHintToDisplay);
    const nextHint =
      puzzle.nextHintToDisplay < detail.hints.length
        ? detail.hints[puzzle.nextHintToDisplay]
        : undefined;
    const nextHintTimePenalty = nextHint ? nextHint.timePenalty : 0;
    const isNextHintSolution = nextHint ? nextHint.solutionWarning : undefined;
    questData.puzzles.push({
      name: puzzle.puzzleName,
      displayName: detail.displayName,
      type: detail.type,
      text: detail.text,
      solutionDisplayText: detail.solutionDisplayText,
      hints: hints,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      nextHintTimePenalty: nextHintTimePenalty,
      nextHintSolutionWarning: isNextHintSolution,
      status: puzzle.status,
      statusDescription: statusDescription,
      startTime: puzzle.startTime,
      endTime: puzzle.endTime,
      activationTime: puzzle.activationTime,
      activationCode: puzzle.activationCode,
    });
  });
  return { status: "success", statusCode: 200, data: questData };
}

/**
 * Starts a quest, making the first puzzle available for activation.
 * @param {string} name the name of the quest to start
 * @returns {object} a response object containing a status, status code, and data
 */
export async function startQuest(name) {
  const foundQuest = await Quest.findOne({ name: name });
  if (foundQuest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${name} found`,
    };
  }

  if (foundQuest.status !== QuestStatus.NOT_STARTED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${name} cannot be started; status is ${foundQuest.status}`,
    };
  }

  if (foundQuest.puzzles.length === 0) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${name} cannot be started; it has no puzzles`,
    };
  }

  foundQuest.status = QuestStatus.IN_PROGRESS;
  foundQuest.puzzles[0].status = QuestPuzzleStatus.AWAITING_ACTIVATION;
  foundQuest.puzzles[0].startTime = new Date(Date.now());
  try {
    await foundQuest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Resets a quest to its initial state.
 * @param {string} questName the name of the quest
 * @returns {object} a response object containing a status, status code, and data
 */
export async function resetQuest(questName) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }
  quest.status = QuestStatus.NOT_STARTED;
  quest.puzzles.forEach((puzzle) => {
    puzzle.status = QuestPuzzleStatus.UNAVAILABLE;
    puzzle.nextHintToDisplay = 0;
    puzzle.startTime = undefined;
    puzzle.endTime = undefined;
    puzzle.activationTime = undefined;
  });
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err.message };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Activates a puzzle in the quest, moving it from "awaiting activation" to "in progress"
 * @param {string} questName the name of the quest for which to activate the puzzle
 * @param {string} puzzleName the name of the puzzle within the quest to activate
 * @param {string} activationCode the activation code of the puzzle
 * @returns {object} a response object containing a status, status code, and data
 */
export async function activatePuzzle(questName, puzzleName, activationCode) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is already completed`,
    };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is not yet started`,
    };
  }

  const pendingPuzzles = quest.puzzles.filter(
    (puzzle) =>
      puzzle.puzzleName === puzzleName &&
      puzzle.status > QuestPuzzleStatus.UNAVAILABLE
  );

  if (!pendingPuzzles.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with name ${puzzleName} in quest ${questName}`,
    };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = pendingPuzzles[0];
  if (currentPuzzle.status !== QuestPuzzleStatus.AWAITING_ACTIVATION) {
    return {
      status: "error",
      statusCode: 400,
      message: `Puzzle ${puzzleName} in quest ${questName} is not awaiting activation`,
    };
  }
  if (currentPuzzle.activationCode !== activationCode) {
    return {
      status: "error",
      statusCode: 406,
      message: "Incorrect activation code for puzzle",
    };
  }

  currentPuzzle.activationTime = new Date(Date.now());
  currentPuzzle.status = QuestPuzzleStatus.IN_PROGRESS;
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Finishes the specified puzzle, if the provided solution is correct.
 * @param {string} questName the name of the quest containing the puzzle to finish
 * @param {string} puzzleName the name of the puzzle to finish
 * @param {string} solutionGuess the guess for the solution of the puzzle
 * @returns {object} a response object containing a status, status code, and data
 */
export async function finishPuzzle(questName, puzzleName, solutionGuess) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is already completed`,
    };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is not yet started`,
    };
  }

  const inProgressPuzzles = quest.puzzles.filter(
    (puzzle) =>
      puzzle.puzzleName === puzzleName &&
      puzzle.status > QuestPuzzleStatus.UNAVAILABLE
  );

  if (!inProgressPuzzles.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with name ${puzzleName} in quest ${questName}`,
    };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = inProgressPuzzles[0];
  if (currentPuzzle.status !== QuestPuzzleStatus.IN_PROGRESS) {
    return {
      status: "error",
      statusCode: 400,
      message: `Puzzle ${puzzleName} in quest ${questName} is not in progress`,
    };
  }
  const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(puzzleName);
  if (puzzleResult.status === "error") {
    return puzzleResult;
  }
  const foundPuzzle = puzzleResult.data;
  const solutionKeywords = foundPuzzle.solutionKeyword.split(",");
  const foundKeywords = solutionKeywords.filter((keyword) =>
    RegExp(keyword, "i").test(solutionGuess)
  );
  if (foundKeywords.length !== solutionKeywords.length) {
    return {
      status: "error",
      statusCode: 406,
      message: "Incorrect guess for puzzle solution",
    };
  }

  const currentTime = new Date(Date.now());
  currentPuzzle.endTime = currentTime;
  currentPuzzle.status = QuestPuzzleStatus.COMPLETED;
  const currentPuzzleIndex = quest.puzzles.indexOf(currentPuzzle);
  if (currentPuzzleIndex < quest.puzzles.length - 1) {
    quest.puzzles[currentPuzzleIndex + 1].status =
      QuestPuzzleStatus.AWAITING_ACTIVATION;
    quest.puzzles[currentPuzzleIndex + 1].startTime = currentTime;
  } else {
    quest.status = QuestStatus.COMPLETED;
  }
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err };
  }
  await quest.save();
  return {
    status: "success",
    statusCode: 200,
    data: foundPuzzle.solutionDisplayText,
  };
}

/**
 * Gets the next hint in the named puzzle for the specified quest.
 * @param {string} questName the name of the quest
 * @param {string} puzzleName the name of the puzzle for which to get the next hint
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getPuzzleHint(questName, puzzleName) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is already completed`,
    };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest ${questName} is not yet started`,
    };
  }

  const inProgressPuzzles = quest.puzzles.filter(
    (puzzle) =>
      puzzle.puzzleName === puzzleName &&
      puzzle.status > QuestPuzzleStatus.UNAVAILABLE
  );
  if (!inProgressPuzzles.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with name ${puzzleName} in quest ${questName}`,
    };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = inProgressPuzzles[0];
  if (currentPuzzle.status !== QuestPuzzleStatus.IN_PROGRESS) {
    return {
      status: "error",
      statusCode: 400,
      message: `Puzzle ${puzzleName} in quest ${questName} is not in progress`,
    };
  }
  const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(puzzleName);
  if (puzzleResult.status === "error") {
    return puzzleResult;
  }
  const foundPuzzle = puzzleResult.data;
  if (currentPuzzle.nextHintToDisplay >= foundPuzzle.hints.length) {
    return { status: "success", statusCode: 200, data: false };
  }
  const nextHint = foundPuzzle.hints[currentPuzzle.nextHintToDisplay];
  currentPuzzle.nextHintToDisplay += 1;
  const solutionWarning =
    currentPuzzle.nextHintToDisplay >= foundPuzzle.hints.length
      ? false
      : foundPuzzle.hints[currentPuzzle.nextHintToDisplay].solutionWarning;
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: err };
  }
  return {
    status: "success",
    statusCode: 200,
    data: {
      hintText: nextHint.text,
      moreHints: currentPuzzle.nextHintToDisplay < foundPuzzle.hints.length,
      timePenalty: nextHint.timePenalty,
      isNextHintSolution: solutionWarning,
    },
  };
}

/**
 * Generates a QR code for activating the specified puzzle.
 * @param {string} questName the quest containing the puzzle
 * @param {string} puzzleName the puzzle for which to generate the activation QR code
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getPuzzleActivationQrCode(questName, puzzleName) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  const puzzles = quest.puzzles.filter(
    (puzzle) => puzzle.puzzleName === puzzleName
  );
  if (!puzzles.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle with name ${puzzleName} in quest ${questName}`,
    };
  }

  // Should only ever be one puzzle with this name, so get the first one.
  const puzzle = puzzles[0];
  try {
    const qrCodeData = await QRCode.toBuffer(puzzle.activationCode);
    return { status: "success", statusCode: 200, data: qrCodeData };
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: err.message
    };
  }
}

/**
 * Sets the expected response from an incoming text message and the corresponding confirmation.
 * @param {string} questName name of the quest for which to set the expected response
 * @param {string} expectedResponse expected text message response from a quest user
 * @param {string} responseConfirmation the confirmation to send when the correct response is received
 * @returns {object} a response object containing a status, status code, and data
 */
export async function setExpectedTextResponse(questName, expectedResponse, responseConfirmation) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }
  quest.textResponse = expectedResponse;
  quest.textResponseConfirmation = responseConfirmation;
  try {
    await quest.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: err.message
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Validates the text response sent by a user, case insensitively.
 * @param {string} questName the name of the quest to check for the text response
 * @param {string} textResponse the text response to validate
 * @returns {object} a response object containing a status, status code, and data
 */
export async function validateExpectedTextResponse(questName, textResponse) {
  const quest = await Quest.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }
  if (!quest.textResponse) {
    return {
      status: "error",
      statusCode: 418,
      message: `Quest is not expecting a text response`,
    };
  }
  if (!quest.textResponseConfirmation) {
    return {
      status: "error",
      statusCode: 418,
      message: `Quest is not expecting a text response`,
    };
  }
  const questTextResponse = quest.textResponse.toLowerCase();
  const questTextResponseConfirmation = quest.textResponseConfirmation;
  if (questTextResponse !== textResponse.toLowerCase()) {
    return {
      status: "error",
      statusCode: 400,
      message: `Expected response does not match`,
    };
  }
  quest.textResponse = "";
  quest.textResponseConfirmation = "";
  await quest.save();
  return { status: "success", statusCode: 200, data: questTextResponseConfirmation };
}
