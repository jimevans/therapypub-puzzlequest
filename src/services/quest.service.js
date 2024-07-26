import { randomUUID } from "crypto";
import QRCode from "qrcode";
import {
  QuestModel,
  QuestStatus,
  QuestPuzzleStatus,
} from "../models/quest.model.js";
import * as PuzzleService from "./puzzle.service.js";
import * as UserService from "./user.service.js";

/**
 * @typedef {Object} PuzzleResult
 * @property {string} status the status of the operation
 * @property {number} statusCode the numeric status code of the operation
 * @property {string | undefined} message text of a message describing the result, especially in an error condition
 * @property {PuzzleService.Puzzle | PuzzleService.Puzzle[] | undefined} data the user returned in the result
 */

/**
 * A data class describing a puzzle in a quest
 */
export class QuestPuzzle {
  /**
   * Gets or sets the unique puzzle name.
   * @type {string}
   */
  puzzleName;

  /**
   * Gets or sets the index of the next hint to display for this puzzle in this quest.
   * @type {number}
   */
  nextHintToDisplay;

  /**
   * Gets or sets the status of the puzzle in the quest.
   * @type {number}
   */
  status;

  /**
   * Gets or sets the text description of the status of this puzzle in the quest.
   * @type {string}
   */
  statusDescription;

  /**
   * Gets or sets the code to activate the puzzle in the quest.
   * @type {string}
   */
  activationCode;

  /**
   * Gets or sets the time when the puzzle is available for activation.
   * @type {Date}
   */
  startTime;

  /**
   * Gets or sets the time when the puzzle is solved.
   * @type {Date}
   */
  endTime;

  /**
   * Gets or sets the time when the puzzle is activated.
   * @type {Date}
   */
  activationTime;

  /**
   * Gets or sets the details of the puzzle.
   * @type {PuzzleService.Puzzle}
   */
  puzzleDetail;

  /**
   * Initializes a new instance of the QuestPuzzle class.
   * @param {object} puzzleDefinition an object containing the definition of quest puzzle properties
   */
  constructor(puzzleDefinition) {
    this.puzzleName = puzzleDefinition.puzzleName;
    this.nextHintToDisplay = puzzleDefinition.nextHintToDisplay;
    this.status = puzzleDefinition.status;
    this.activationCode = puzzleDefinition.activationCode;
    this.startTime = puzzleDefinition.startTime;
    this.endTime = puzzleDefinition.endTime;
    this.activationTime = puzzleDefinition.activationTime;
    switch (this.status) {
      case QuestPuzzleStatus.AWAITING_ACTIVATION:
        this.statusDescription = "Awaiting activation";
        break;
      case QuestPuzzleStatus.IN_PROGRESS:
        this.statusDescription = "In progress";
        break;
      case QuestPuzzleStatus.COMPLETED:
        this.statusDescription = "Completed";
        break;
      default:
        this.statusDescription = "Unavailable";
        break;
    }
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this QuestPuzzle.
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    const serializableObject = {
      puzzleName: this.puzzleName,
      nextHintToDisplay: this.nextHintToDisplay,
      status: this.status,
      activationCode: this.activationCode,
      startTime: this.startTime,
      endTime: this.endTime,
      activationTime: this.activationTime,
      statusDescription: this.statusDescription,
    };
    // If puzzle lookup data is present, flatten certain properties
    // for rendering.
    if (this.puzzleDetail) {
      serializableObject.displayName = this.puzzleDetail.displayName;
      // serializableObject.type = this.puzzleDetail.type;
      // serializableObject.text = this.puzzleDetail.text;
      serializableObject.solutionDisplayText =
        this.puzzleDetail.solutionDisplayText;
      serializableObject.hints = this.puzzleDetail.hints;
    }
    return serializableObject;
  }
}

/**
 * A data class describing a quest.
 */
export class Quest {
  /**
   * Gets or sets the unique name of the quest.
   * @type {string}
   */
  name;

  /**
   * Gets or sets the display name of this quest.
   * @type {string}
   */
  displayName;

  /**
   * Gets or sets the user or team assigned to this quest.
   * @type {string}
   *
   */
  userName;

  /**
   * The status of this quest.
   * @type {number}
   */
  status;

  /**
   * Gets or sets the text description of the status of this quest.
   * @type {string}
   */
  statusDescription;

  /**
   * Gets or sets the expected text message sent from a user
   * to the application via SMS.
   * @type {string}
   */
  textResponse;

  /**
   * Gets or sets the response once the expected text message is
   * received by a user via SMS.
   * @type {string}
   */
  textResponseConfirmation;

  /**
   * The list of puzzles assigned to this quest.
   * @type {QuestPuzzle[]}
   */
  puzzles = [];

  /**
   * Initializes a new instance of the Quest class.
   * @param {object} puzzleDefinition an object containing the definition of quest properties
   */
  constructor(questDefinition) {
    this.name = questDefinition.name;
    this.displayName = questDefinition.displayName;
    this.userName = questDefinition.userName;
    this.status = questDefinition.status;
    this.textResponse = questDefinition.textResponse;
    this.textResponseConfirmation = questDefinition.textResponseConfirmation;
    if (questDefinition.puzzles) {
      this.puzzles = questDefinition.puzzles.map(
        (puzzle) => new QuestPuzzle(puzzle)
      );
    }
    switch (this.status) {
      case QuestStatus.NOT_STARTED:
        this.statusDescription = "Not yet started";
        break;
      case QuestStatus.IN_PROGRESS:
        this.statusDescription = "In progress";
        break;
      case QuestStatus.COMPLETED:
        this.statusDescription = "Completed";
        break;
      default:
        this.statusDescription = "Unavailable";
        break;
    }
  }

  /**
   * Gets the puzzle with the specified name, or null if not present.
   * @param {string} puzzleName the name of the puzzle to retrieve.
   * @return {QuestPuzzle | null} the puzzle in the quest, if it exists
   */
  getPuzzle(puzzleName) {
    const filteredPuzzles = this.puzzles.filter(
      (puzzle) => puzzle.puzzleName === puzzleName
    );

    if (filteredPuzzles.length === 0) {
      return null;
    }

    return filteredPuzzles[0];
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this Quest.
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    return {
      name: this.name,
      displayName: this.displayName,
      userName: this.userName,
      status: this.status,
      statusDescription: this.statusDescription,
      textResponse: this.textResponse,
      textResponseConfirmation: this.textResponseConfirmation,
      puzzles: this.puzzles,
    };
  }
}

/**
 * Generates the error message returned when no quests meet the specified criteria.
 * @param {object} queryOptions the query options for the quest
 * @param {string | undefined} queryOptions.questName the name of the quest to retrieve, if any
 * @param {string[] | undefined} queryOptions.userNames the names of the users and teams for which to retrieve quests, if any
 * @param {number | undefined} queryOptions.questStatus the status that the quest must be greater than or equal to be included in the result, if any
 * @returns {string} the error message to be displayed if no quests are found for the criteria
 */
function createFindErrorMessage(queryOptions) {
  const errorMessage = [];
  if (queryOptions?.questName) {
    errorMessage.push(`quest name equal to ${queryOptions.questName}`);
  }
  if (queryOptions?.userNames) {
    errorMessage.push(
      `user name or team name that is one of [${queryOptions.userNames.join(
        ", "
      )}]`
    );
  }
  if (queryOptions?.questStatus) {
    errorMessage.push(`status greater than or equal to ${queryOptions.quests}`);
  }
  return errorMessage.join(" and ");
}

/**
 * Generates the match parameter to use in the query for quests.
 * @param {string | undefined} queryOptions.questName the name of the quest to retrieve, if any
 * @param {string[] | undefined} queryOptions.userNames the names of the users and teams for which to retrieve quests, if any
 * @param {number | undefined} queryOptions.questStatus the status that the quest must be greater than or equal to be included in the result, if any
 * @returns {object} an object representing the match criteria to use in the query aggregation pipeline
 */
function createFindMatchParameter(queryOptions) {
  const matchParam = {};
  if (queryOptions?.questName) {
    // Limit results to only quests having the specified quest name.
    // NOTE: this should only ever return a single quest.
    matchParam.name = queryOptions.questName;
  }
  if (queryOptions?.userNames) {
    // Limit results to only quests with the userName property set to
    // one of the specified names. Note that user names and team names
    // are expected in the array.
    matchParam.userName = { $in: queryOptions.userNames };
  }
  if (queryOptions?.questStatus) {
    // Limit the results to only quests with a status greater than or equal
    // to the specified status value. This allows the user to not return
    // quests in the "unavailable" state.
    matchParam.status = { $gte: queryOptions.questStatus };
  }
  return matchParam;
}

/**
 * Generates the parameters to use to return all puzzle details in the result when querying for quests.
 * @returns {object} an object containing the stages to add to the aggregation pipeline to include puzzle details
 */
function createFindPuzzleDetailsParameters() {
  const detailsParams = {};
  detailsParams.lookupParam = {
    from: "puzzles",
    localField: "puzzles.puzzleName",
    foreignField: "name",
    as: "lookupPuzzles",
  };
  detailsParams.addFieldsParam = {
    puzzles: {
      $map: {
        input: "$puzzles",
        as: "questPuzzle",
        in: {
          $setField: {
            field: "details",
            input: "$$questPuzzle",
            value: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$lookupPuzzles",
                    cond: {
                      $eq: ["$$this.name", "$$questPuzzle.puzzleName"],
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      },
    },
  };
  return detailsParams;
}

/**
 * Generates the parameter to define fields projected into the result of querying for quests.
 * @param {object} queryOptions the query options for the quest
 * @param {number | undefined} queryOptions.puzzleStatus the status that quest puzzles must be greater than or equal to be included in the returned quests, if any
 * @returns {object} an object representing the fields to be projected into the result of in the aggregation pipeline
 */
function createFindResultProjectionParameter(queryOptions) {
  const projectParams = {
    name: true,
    displayName: true,
    userName: true,
    status: true,
    textResponse: true,
    textResponseConfirmation: true,
  };
  if (queryOptions?.puzzleStatus) {
    const filter = {
      input: "$puzzles",
      as: "puzzle",
      cond: { $gte: ["$$puzzle.status", queryOptions.puzzleStatus] },
    };
    projectParams.puzzles = { $filter: filter };
  } else {
    projectParams.puzzles = true;
  }
  return projectParams;
}

/**
 * Queries for a quest given the passed in parameters.
 * @param {object} queryOptions the query options for the quest
 * @param {string | undefined} queryOptions.questName the name of the quest to retrieve, if any
 * @param {string[] | undefined} queryOptions.userNames the names of the users and teams for which to retrieve quests, if any
 * @param {number | undefined} queryOptions.questStatus the status that the quest must be greater than or equal to be included in the result, if any
 * @param {number | undefined} queryOptions.puzzleStatus the status that quest puzzles must be greater than or equal to be included in the returned quests, if any
 * @param {boolean} includeExtendedAttributes true to return puzzle details with each puzzle in the quest
 * @returns {Promise<QuestResult>} a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function findQuests(
  queryOptions = {},
  includeExtendedAttributes = false
) {
  const pipelineStages = [];
  const matchParam = createFindMatchParameter(queryOptions);
  pipelineStages.push({ $match: matchParam });
  if (includeExtendedAttributes) {
    const puzzleDetailsParams = createFindPuzzleDetailsParameters();
    pipelineStages.push({ $lookup: puzzleDetailsParams.lookupParam });
    pipelineStages.push({ $addFields: puzzleDetailsParams.addFieldsParam });
  }
  const projectParam = createFindResultProjectionParameter(queryOptions);
  pipelineStages.push({ $project: projectParam });
  const foundQuests = await QuestModel.aggregate(pipelineStages);
  if (foundQuests.length === 0) {
    const returnedError = createFindErrorMessage(queryOptions);
    return {
      status: "error",
      statusCode: 404,
      message: `no quests found${
        returnedError ? " matching " + returnedError : ""
      }`,
    };
  }
  const quests = foundQuests.map((foundQuest) => {
    const quest = new Quest(foundQuest);
    if (includeExtendedAttributes) {
      quest.puzzles.forEach((puzzle) => {
        const filtered = foundQuest.puzzles.filter(
          (questPuzzle) => questPuzzle.puzzleName === puzzle.puzzleName
        );
        const detail = new PuzzleService.Puzzle(filtered[0].details);
        puzzle.puzzleDetail = detail;
      });
    }
    return quest;
  });
  return { status: "success", statusCode: 200, data: quests };
}

/**
 * Gets a quest with the specified name.
 * @param {string} questName the name of the quest to retrieve
 * @param {UserService.User} user the user and teams for which to retrieve quests
 * @returns {Promise<QuestResult>} a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function getQuestByQuestName(questName, user) {
  const queryOptions = { questName: questName };
  if (!user.isAdmin()) {
    // If the user is a regular user on a quest, only return
    // the quest if it is in progress or completed, and only
    // return puzzles that are awaiting activation, in progress,
    // or completed.
    queryOptions.userNames = await user.getAllUserContexts();
    queryOptions.questStatus = QuestStatus.IN_PROGRESS;
    queryOptions.puzzleStatus = QuestPuzzleStatus.AWAITING_ACTIVATION;
  }
  const queryResult = await findQuests(queryOptions, true);
  if (queryResult.status === "error") {
    return queryResult;
  }
  return { status: "success", statusCode: 200, data: queryResult.data[0] };
}


/**
 * Gets a quest with the specified name.
 * @param {string} questName the name of the quest to retrieve
 * @param {string} puzzleName the name of the puzzle in the quest to retrieve
 * @param {UserService.User} user the user and teams for which to retrieve quests
 * @returns {Promise<QuestResult>} a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function getQuestPuzzle(questName, puzzleName, user) {
  const queryResult = await getQuestByQuestName(questName, user);
  if (queryResult.status === "error") {
    return queryResult;
  }

  const quest = queryResult.data;
  const filteredPuzzles = quest.puzzles.filter(
    (puzzle) => puzzle.puzzleName === puzzleName
  );
  if (!filteredPuzzles.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No puzzle named ${puzzleName} found for quest ${questName}`
    }
  }

  // The filtered puzzles array should only contain one entry
  // since we are filtering by unique puzzle name, so we can
  // just take the 0th entry.
  return { status: "success", statusCode: 200, data: filteredPuzzles[0] };
}


/**
 * Creates a quest in the data store.
 * @param {Quest} questDefinition the definition of the quest to create.
 * @returns {Promise<QuestResult>} a response object containing a status, status code, and data
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
  const questExists = (await QuestModel.find({ name: questName })).length !== 0;
  if (questExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `Quest with name ${questName} already exists`,
    };
  }
  const quest = new QuestModel({
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
    return { status: "error", statusCode: 500, message: err.message };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Deletes a quest from the data store.
 * @param {string} name the name of the quest to delete
 * @returns {Promise<QuestResult>} a response object containing a status, status code, and data
 */
export async function deleteQuest(name) {
  const result = await QuestModel.findOneAndDelete({ name: name });
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
 * @param {Quest} questDefinition quest definition containing the updated data
 * @returns {Promise<QuestResult>} a response object containing a status, status code, and data
 */
export async function updateQuest(questDefinition) {
  const foundQuest = await QuestModel.findOne({ name: questDefinition.name });
  if (foundQuest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questDefinition.name} found`,
    };
  }
  foundQuest.displayName = questDefinition.displayName || questDefinition.name;
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
 * Starts a quest, making the first puzzle available for activation.
 * @param {string} name the name of the quest to start
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function startQuest(name) {
  const foundQuest = await QuestModel.findOne({ name: name });
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
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function resetQuest(questName) {
  const quest = await QuestModel.findOne({ name: questName });
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
 * @param {string[]} userContexts an array of all of the contexts (user names and team names) for the user requesting activation
 * @param {string} activationCode the activation code of the puzzle
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function activatePuzzle(questName, puzzleName, userContexts, activationCode) {
  const quest = await QuestModel.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (!userContexts.includes(quest.userName)) {
    return {
      status: "error",
      statusCode: 403,
      message: `User is not authorized to activate puzzles for quest ${questName}`,
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
 * @param {string[]} userContexts an array of all of the contexts (user names and team names) for the user attempting to solve
 * @param {string} solutionGuess the guess for the solution of the puzzle
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function finishPuzzle(questName, puzzleName, userContexts, solutionGuess) {
  const quest = await QuestModel.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (!userContexts.includes(quest.userName)) {
    return {
      status: "error",
      statusCode: 403,
      message: `User is not authorized to solve puzzles for quest ${questName}`,
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
 * @param {string[]} userContexts an array of all of the contexts (user names and team names) for the user attempting to solve
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function getPuzzleHint(questName, puzzleName, userContexts) {
  const quest = await QuestModel.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  if (!userContexts.includes(quest.userName)) {
    return {
      status: "error",
      statusCode: 403,
      message: `User is not authorized to request puzzle hints for quest ${questName}`,
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
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function getPuzzleActivationQrCode(questName, puzzleName) {
  const quest = await QuestModel.findOne({ name: questName });
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
      message: err.message,
    };
  }
}

/**
 * Sets the expected response from an incoming text message and the corresponding confirmation.
 * @param {string} questName name of the quest for which to set the expected response
 * @param {string} expectedResponse expected text message response from a quest user
 * @param {string} responseConfirmation the confirmation to send when the correct response is received
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function setExpectedTextResponse(
  questName,
  expectedResponse,
  responseConfirmation
) {
  const quest = await QuestModel.findOne({ name: questName });
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
      message: err.message,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Validates the text response sent by a user, case insensitively.
 * @param {string} questName the name of the quest to check for the text response
 * @param {string} textResponse the text response to validate
 * @returns {Promise<PuzzleResult>} a response object containing a status, status code, and data
 */
export async function validateExpectedTextResponse(questName, textResponse) {
  const quest = await QuestModel.findOne({ name: questName });
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
  return {
    status: "success",
    statusCode: 200,
    data: questTextResponseConfirmation,
  };
}
