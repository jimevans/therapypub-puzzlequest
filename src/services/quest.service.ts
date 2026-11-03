import { randomUUID } from "crypto";
import path from "path";
import { marked, type Token } from "marked";
import mongoose, { type PipelineStage } from "mongoose";
import QRCode from "qrcode";
import {
  type PuzzleRules,
  type QuestErrorCode,
  type QuestEvent,
  type QuestState,
  type TransitionResult,
  activatePuzzle as activate,
  parseSolutionKeywords,
  reset,
  revealHint,
  start,
  submitSolution,
} from "../domain/quest/index.js";
import {
  type PublishedQuestEvent,
  type QuestActionOrigin,
  questEventBus,
} from "../events/questEventBus.js";
import { PuzzleModel } from "../models/puzzle.model.js";
import {
  QuestModel,
  QuestStatus,
  QuestPuzzleStatus,
} from "../models/quest.model.js";
import { publicDirectory } from "../paths.js";
import type { ServiceResult } from "../types.js";
import * as PuzzleService from "./puzzle.service.js";
import type { User } from "./user.service.js";
import { getErrorMessage } from "../errors.js";

/**
 * The result of a quest service operation; data is a Quest unless the
 * function's documentation says otherwise.
 */
export type QuestResult<T = Quest> = ServiceResult<T>;

/**
 * The properties a QuestPuzzle is created from: a quest's stored progress on
 * a puzzle, or a puzzle sent by the quest editor.
 */
export type QuestPuzzleProperties = Pick<
  QuestPuzzle,
  "puzzleName" | "nextHintToDisplay" | "status" | "activationCode"
> &
  Partial<Pick<QuestPuzzle, "startTime" | "endTime" | "activationTime">>;

/** The properties a Quest is created from: a stored quest, or a request. */
export type QuestProperties = Pick<
  Quest,
  "name" | "displayName" | "userName" | "status"
> &
  Partial<Pick<Quest, "textResponse" | "textResponseConfirmation">> & {
    puzzles?: QuestPuzzleProperties[];
  };

/** A quest as returned by the findQuests aggregation, with puzzle details. */
type AggregatedQuest = Omit<QuestProperties, "puzzles"> & {
  puzzles: (QuestPuzzleProperties & {
    details?: PuzzleService.PuzzleDefinition;
  })[];
};

/**
 * A data class describing a puzzle in a quest
 */
export class QuestPuzzle {
  /**
   * Gets or sets the unique puzzle name.
   */
  puzzleName: string;

  /**
   * Gets or sets the index of the next hint to display for this puzzle in this quest.
   */
  nextHintToDisplay: number;

  /**
   * Gets or sets the status of the puzzle in the quest.
   */
  status: number;

  /**
   * Gets or sets the text description of the status of this puzzle in the quest.
   */
  statusDescription: string;

  /**
   * Gets or sets the code to activate the puzzle in the quest.
   */
  activationCode: string;

  /**
   * Gets or sets the time when the puzzle is available for activation.
   */
  startTime?: Date | null;

  /**
   * Gets or sets the time when the puzzle is solved.
   */
  endTime?: Date | null;

  /**
   * Gets or sets the time when the puzzle is activated.
   */
  activationTime?: Date | null;

  /**
   * Gets or sets the details of the puzzle.
   */
  puzzleDetail?: PuzzleService.Puzzle;

  /**
   * Initializes a new instance of the QuestPuzzle class.
   * @param puzzleDefinition an object containing the definition of quest puzzle properties
   */
  constructor(puzzleDefinition: QuestPuzzleProperties) {
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
   * @returns the object to be serialized to JSON
   */
  toJSON(): Record<string, unknown> {
    const serializableObject: Record<string, unknown> = {
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
   */
  name: string;

  /**
   * Gets or sets the display name of this quest.
   */
  displayName: string;

  /**
   * Gets or sets the user or team assigned to this quest.
   *
   */
  userName: string;

  /**
   * The status of this quest.
   */
  status: number;

  /**
   * Gets or sets the text description of the status of this quest.
   */
  statusDescription: string;

  /**
   * Gets or sets the expected text message sent from a user
   * to the application via SMS.
   */
  textResponse?: string;

  /**
   * Gets or sets the response once the expected text message is
   * received by a user via SMS.
   */
  textResponseConfirmation?: string;

  /**
   * The list of puzzles assigned to this quest.
   */
  puzzles: QuestPuzzle[] = [];

  /**
   * Initializes a new instance of the Quest class.
   * @param questDefinition an object containing the definition of quest properties
   */
  constructor(questDefinition: QuestProperties) {
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
   * @param puzzleName the name of the puzzle to retrieve.
   * @returns the puzzle in the quest, if it exists
   */
  getPuzzle(puzzleName: string): QuestPuzzle | null {
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
   * @returns the object to be serialized to JSON
   */
  toJSON(): QuestJSON {
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

/** The JSON representation of a Quest. */
export type QuestJSON = Pick<
  Quest,
  | "name"
  | "displayName"
  | "userName"
  | "status"
  | "statusDescription"
  | "textResponse"
  | "textResponseConfirmation"
  | "puzzles"
>;

/**
 * Options for querying quests. Every option is optional.
 */
export interface QuestQueryOptions {
  /** The name of the quest to retrieve. */
  questName?: string;
  /** The names of the users and teams for which to retrieve quests. */
  userNames?: string[];
  /** The status that the quest must be greater than or equal to be included in the result. */
  questStatus?: number;
  /** The status that quest puzzles must be greater than or equal to be included in the returned quests. */
  puzzleStatus?: number;
}

/**
 * The definition of a quest to create or update. Properties left out of an
 * update keep their stored values.
 */
export interface QuestDefinition {
  /** The unique name of the quest. */
  name?: string;
  /** The name of the quest shown to players. */
  displayName?: string;
  /** The user or team the quest is assigned to. */
  userName?: string;
  /** The status of the quest. */
  status?: number;
  /** The puzzles in the quest, in order. */
  puzzles?: (Partial<QuestPuzzleProperties> & { puzzleName: string })[];
}

/**
 * The result of solving a puzzle.
 */
export interface PuzzleSolution {
  /** The time the puzzle was solved. */
  endTime: Date;
  /** The solution text to show the player. */
  solutionText: string;
  /** The name of the next puzzle, if there is one. */
  nextPuzzleName?: string;
  /** The display name of the next puzzle, if there is one. */
  nextPuzzleDisplayName?: string;
  /** True if this was the last puzzle in the quest. */
  questComplete?: boolean;
}

/**
 * A hint revealed to a player.
 */
export interface PuzzleHintResult {
  /** The text of the hint. */
  hintText: string;
  /** True if the puzzle has more hints. */
  moreHints: boolean;
  /** The time penalty for the hint, in seconds. */
  timePenalty: number;
  /** True if the next hint gives away the solution. */
  isNextHintSolution: boolean;
}

/**
 * Generates the error message returned when no quests meet the specified criteria.
 * @param queryOptions the query options for the quest
 * @returns the error message to be displayed if no quests are found for the criteria
 */
function createFindErrorMessage(queryOptions?: QuestQueryOptions): string {
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
    errorMessage.push(
      `status greater than or equal to ${queryOptions.questStatus}`
    );
  }
  return errorMessage.join(" and ");
}

/**
 * Generates the match parameter to use in the query for quests.
 * @param queryOptions the query options for the quest
 * @returns an object representing the match criteria to use in the query aggregation pipeline
 */
function createFindMatchParameter(queryOptions?: QuestQueryOptions): object {
  const matchParam: Record<string, unknown> = {};
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
 * @returns an object containing the stages to add to the aggregation pipeline to include puzzle details
 */
function createFindPuzzleDetailsParameters(): {
  lookupParam: PipelineStage.Lookup["$lookup"];
  addFieldsParam: PipelineStage.AddFields["$addFields"];
} {
  const detailsParams = {} as {
    lookupParam: PipelineStage.Lookup["$lookup"];
    addFieldsParam: object;
  };
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
 * @param queryOptions the query options for the quest
 * @returns an object representing the fields to be projected into the result of in the aggregation pipeline
 */
function createFindResultProjectionParameter(
  queryOptions?: QuestQueryOptions
): object {
  const projectParams: Record<string, unknown> = {
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
 * @param queryOptions the query options for the quest
 * @param includeExtendedAttributes true to return puzzle details with each puzzle in the quest
 * @returns a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function findQuests(
  queryOptions: QuestQueryOptions = {},
  includeExtendedAttributes: boolean = false
): Promise<QuestResult<Quest[]>> {
  const pipelineStages: PipelineStage[] = [];
  const matchParam = createFindMatchParameter(queryOptions);
  pipelineStages.push({ $match: matchParam });
  if (includeExtendedAttributes) {
    const puzzleDetailsParams = createFindPuzzleDetailsParameters();
    pipelineStages.push({ $lookup: puzzleDetailsParams.lookupParam });
    pipelineStages.push({ $addFields: puzzleDetailsParams.addFieldsParam });
  }
  const projectParam = createFindResultProjectionParameter(queryOptions);
  pipelineStages.push({
    $project: projectParam as PipelineStage.Project["$project"],
  });
  const foundQuests =
    await QuestModel.aggregate<AggregatedQuest>(pipelineStages);
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
        // A puzzle deleted after it was added to the quest has no details.
        const details = filtered[0]?.details;
        if (details) {
          puzzle.puzzleDetail = new PuzzleService.Puzzle(details);
        }
      });
    }
    return quest;
  });
  return { status: "success", statusCode: 200, data: quests };
}

/**
 * Gets a quest with the specified name.
 * @param questName the name of the quest to retrieve
 * @param user the user and teams for which to retrieve quests; omit for no filtering
 * @returns a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function getQuestByQuestName(
  questName: string,
  user?: User | null
): Promise<QuestResult> {
  const queryOptions: QuestQueryOptions = { questName: questName };
  if (user && !user.isAdmin()) {
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
 * @param questName the name of the quest to retrieve
 * @param puzzleName the name of the puzzle in the quest to retrieve
 * @param user the user and teams for which to retrieve quests; omit for no filtering
 * @returns a Promise resolving to a result containing the array of quests matching
 *  the parameters or an error result if no quests are found.
 */
export async function getQuestPuzzle(
  questName: string,
  puzzleName: string,
  user?: User | null
): Promise<QuestResult<QuestPuzzle>> {
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
      message: `No puzzle named ${puzzleName} found for quest ${questName}`,
    };
  }

  // The filtered puzzles array should only contain one entry
  // since we are filtering by unique puzzle name, so we can
  // just take the 0th entry.
  return { status: "success", statusCode: 200, data: filteredPuzzles[0] };
}

/**
 * Checks a quest's list of puzzles: each puzzle must exist and appear only once.
 * @param puzzleNames the names of the puzzles in the quest
 * @returns an error result, or null if the list is valid
 */
async function validateQuestPuzzleNames(
  puzzleNames: string[]
): Promise<QuestResult<undefined> | null> {
  const duplicates = puzzleNames.filter(
    (puzzleName, index) => puzzleNames.indexOf(puzzleName) !== index
  );
  if (duplicates.length) {
    return {
      status: "error",
      statusCode: 400,
      message: `Puzzles may appear only once in a quest: ${[
        ...new Set(duplicates),
      ].join(", ")}`,
    };
  }
  const foundPuzzles = await PuzzleModel.find({
    name: { $in: puzzleNames },
  }).select("name");
  const foundNames = new Set(foundPuzzles.map((puzzle) => puzzle.name));
  const missing = puzzleNames.filter(
    (puzzleName) => !foundNames.has(puzzleName)
  );
  if (missing.length) {
    return {
      status: "error",
      statusCode: 400,
      message: `No puzzles found with names: ${missing.join(", ")}`,
    };
  }
  return null;
}

/**
 * Creates a new quest puzzle entry that has not yet been made available.
 * @param puzzleName the name of the puzzle
 * @returns the quest puzzle data
 */
function createQuestPuzzleEntry(puzzleName: string): QuestPuzzleProperties {
  return {
    puzzleName,
    nextHintToDisplay: 0,
    status: QuestPuzzleStatus.UNAVAILABLE,
    activationCode: randomUUID().replaceAll("-", ""),
  };
}

/**
 * Creates a quest in the data store.
 * @param questDefinition the definition of the quest to create.
 * @returns a response object containing a status, status code, and data
 */
export async function createQuest(
  questDefinition: QuestDefinition
): Promise<QuestResult<undefined>> {
  let questName: string;
  if (questDefinition.name !== undefined) {
    questName = questDefinition.name;
  } else if (questDefinition.displayName !== undefined) {
    questName = questDefinition.displayName
      .trim()
      .replace(/\s+/g, ".")
      .toLowerCase();
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

  if (questDefinition.puzzles) {
    const puzzleNames = questDefinition.puzzles.map(
      (puzzleDefinition) => puzzleDefinition.puzzleName
    );
    const puzzleError = await validateQuestPuzzleNames(puzzleNames);
    if (puzzleError) {
      return puzzleError;
    }
    quest.puzzles.push(...puzzleNames.map(createQuestPuzzleEntry));
  }
  try {
    await quest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: getErrorMessage(err) };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Deletes a quest from the data store.
 * @param name the name of the quest to delete
 * @returns a response object containing a status, status code, and data
 */
export async function deleteQuest(
  name: string
): Promise<QuestResult<undefined>> {
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

// Quest puzzle fields that an update may set. Fields left out of an update
// keep their stored values.
const UPDATABLE_QUEST_PUZZLE_FIELDS = [
  "nextHintToDisplay",
  "status",
  "activationCode",
  "startTime",
  "activationTime",
  "endTime",
] as const;

/**
 * Updates a quest in the data store.
 * @param questDefinition quest definition containing the updated data
 * @returns a response object containing a status, status code, and data
 */
export async function updateQuest(
  questDefinition: QuestDefinition & { name: string }
): Promise<QuestResult<undefined>> {
  const foundQuest = await QuestModel.findOne({ name: questDefinition.name });
  if (foundQuest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questDefinition.name} found`,
    };
  }
  const status = questDefinition.status ?? foundQuest.status;
  const validStatuses: number[] = Object.values(QuestStatus);
  if (!validStatuses.includes(status)) {
    return {
      status: "error",
      statusCode: 400,
      message: `Invalid quest status ${status}`,
    };
  }
  foundQuest.displayName = questDefinition.displayName || questDefinition.name;
  foundQuest.userName = questDefinition.userName || foundQuest.userName;
  foundQuest.status = status;
  if (questDefinition.puzzles) {
    // Puzzles already in the quest keep their stored progress and times;
    // only the fields given in the definition change. Puzzles new to the
    // quest start out unavailable.
    const puzzleNames = questDefinition.puzzles.map(
      (puzzle) => puzzle.puzzleName
    );
    const puzzleError = await validateQuestPuzzleNames(puzzleNames);
    if (puzzleError) {
      return puzzleError;
    }
    const existingPuzzles = new Map(
      foundQuest.puzzles.map((puzzle) => [puzzle.puzzleName, puzzle.toObject()])
    );
    const updatedPuzzles = questDefinition.puzzles.map((puzzleDefinition) => {
      const puzzle: Record<string, unknown> =
        existingPuzzles.get(puzzleDefinition.puzzleName) ??
        createQuestPuzzleEntry(puzzleDefinition.puzzleName);
      for (const field of UPDATABLE_QUEST_PUZZLE_FIELDS) {
        const value = puzzleDefinition[field];
        if (value !== undefined && value !== null && value !== "") {
          puzzle[field] = value;
        }
      }
      return puzzle;
    });
    foundQuest.set("puzzles", updatedPuzzles);
  }
  try {
    await foundQuest.save();
  } catch (err) {
    return { status: "error", statusCode: 500, message: getErrorMessage(err) };
  }
  return { status: "success", statusCode: 200 };
}

/** The error branch of a quest service result. */
type QuestErrorResult = Extract<QuestResult<never>, { status: "error" }>;

/** A quest document loaded from the data store. */
type QuestDocument = InstanceType<typeof QuestModel>;

/**
 * How many times an action is tried when another change to the same quest
 * (usually a teammate's) is saved between loading the quest and saving it.
 */
const MAX_QUEST_ACTION_ATTEMPTS = 3;

/** A player acting on a quest. */
interface QuestActor {
  /** The user name and team names of the player. */
  userContexts: string[];
  /** What the player is doing, for the error message if they may not. */
  action: string;
}

/**
 * The outcome of applying an action to a quest: a service error (such as no
 * quest found), the rules refusing the action, or the action saved.
 * @template R the puzzle rules the action used
 */
type QuestActionOutcome<R> =
  | QuestErrorResult
  | { status: "refused"; error: QuestErrorCode; state: QuestState }
  | {
      status: "applied";
      state: QuestState;
      events: readonly QuestEvent[];
      now: Date;
      rules: R;
    };

/**
 * Loads a quest. A quest stored without a version key, which happens only if
 * it was written outside this application, is given one first, because the
 * version check on save can't detect a conflicting change until it has one.
 * @param questName the name of the quest
 * @returns the quest, or null if there is none
 */
async function loadQuest(questName: string): Promise<QuestDocument | null> {
  const quest = await QuestModel.findOne({ name: questName });
  if (quest === null || quest.__v !== undefined) {
    return quest;
  }
  await QuestModel.updateOne(
    { _id: quest._id, __v: { $exists: false } },
    { $set: { __v: 0 } }
  );
  return QuestModel.findOne({ _id: quest._id });
}

/**
 * Gets a quest's progress in the form the rules work with.
 * @param quest the quest document
 * @returns the quest's state
 */
function toQuestState(quest: QuestDocument): QuestState {
  return {
    status: quest.status as QuestStatus,
    puzzles: quest.puzzles.map((puzzle) => ({
      puzzleName: puzzle.puzzleName,
      status: puzzle.status as QuestPuzzleStatus,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      activationCode: puzzle.activationCode,
      startTime: puzzle.startTime,
      activationTime: puzzle.activationTime,
      endTime: puzzle.endTime,
    })),
  };
}

/**
 * Copies a quest's new progress onto its document. The rules never add,
 * remove, or reorder puzzles, so they line up by index.
 * @param quest the quest document
 * @param state the quest's new state
 */
function applyQuestState(quest: QuestDocument, state: QuestState): void {
  quest.status = state.status;
  state.puzzles.forEach((puzzle, index) => {
    const stored = quest.puzzles[index];
    stored.status = puzzle.status;
    stored.nextHintToDisplay = puzzle.nextHintToDisplay;
    stored.startTime = puzzle.startTime;
    stored.activationTime = puzzle.activationTime;
    stored.endTime = puzzle.endTime;
  });
}

/**
 * Loads a puzzle's definition as the rules for an action on it.
 * @param puzzleName the name of the puzzle
 * @returns the puzzle, or an error result if it doesn't exist
 */
async function loadPuzzleRules(
  puzzleName: string
): Promise<{ rules: PuzzleService.Puzzle } | QuestErrorResult> {
  const result = await PuzzleService.getPuzzleByPuzzleName(puzzleName);
  return result.status === "error" ? result : { rules: result.data };
}

/**
 * Gets the parts of a puzzle the rules need.
 * @param puzzle the puzzle
 * @returns the puzzle's rules
 */
function toPuzzleRules(puzzle: PuzzleService.Puzzle): PuzzleRules {
  return {
    solutionKeywords: parseSolutionKeywords(puzzle.solutionKeyword),
    hints: puzzle.hints,
  };
}

async function noRules(): Promise<{ rules: undefined }> {
  return { rules: undefined };
}

/**
 * Applies an action to a quest: loads the quest, checks that the player may
 * act on it, applies the rules, and saves the result. If another change to
 * the quest is saved first, the action starts over with the updated quest,
 * so the two can't overwrite each other.
 * @param questName the name of the quest
 * @param actor the player acting, or null for an administrative action
 * @param loadRules loads what the rules need; called once, after the player
 *  is authorized
 * @param transition applies the rules
 * @returns the outcome
 */
async function applyQuestAction<R>(
  questName: string,
  actor: QuestActor | null,
  loadRules: () => Promise<{ rules: R } | QuestErrorResult>,
  transition: (state: QuestState, now: Date, rules: R) => TransitionResult
): Promise<QuestActionOutcome<R>> {
  let loaded: { rules: R } | undefined;
  for (let attempt = 0; attempt < MAX_QUEST_ACTION_ATTEMPTS; attempt++) {
    const quest = await loadQuest(questName);
    if (quest === null) {
      return {
        status: "error",
        statusCode: 404,
        message: `No quest with quest name ${questName} found`,
      };
    }
    if (actor && !actor.userContexts.includes(quest.userName)) {
      return {
        status: "error",
        statusCode: 403,
        message: `User is not authorized to ${actor.action} for quest ${questName}`,
      };
    }
    if (!loaded) {
      const rulesResult = await loadRules();
      if ("status" in rulesResult) {
        return rulesResult;
      }
      loaded = rulesResult;
    }
    const now = new Date(Date.now());
    const state = toQuestState(quest);
    const result = transition(state, now, loaded.rules);
    if (!result.ok) {
      return { status: "refused", error: result.error, state };
    }
    applyQuestState(quest, result.state);
    try {
      await quest.save();
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError) {
        continue;
      }
      return {
        status: "error",
        statusCode: 500,
        message: getErrorMessage(err),
      };
    }
    return {
      status: "applied",
      state: result.state,
      events: result.events,
      now,
      rules: loaded.rules,
    };
  }
  return {
    status: "error",
    statusCode: 409,
    message: `Quest ${questName} is being changed by someone else; please try again`,
  };
}

/**
 * Describes why the rules refused an action on one of a quest's puzzles.
 * @param error why the action was refused
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @returns the error result
 */
function puzzleActionRefused(
  error: QuestErrorCode,
  questName: string,
  puzzleName: string
): QuestErrorResult {
  switch (error) {
    case "QUEST_COMPLETED":
      return {
        status: "error",
        statusCode: 400,
        message: `Quest ${questName} is already completed`,
      };
    case "PUZZLE_NOT_FOUND":
      return {
        status: "error",
        statusCode: 404,
        message: `No puzzle with name ${puzzleName} in quest ${questName}`,
      };
    case "PUZZLE_NOT_AWAITING_ACTIVATION":
      return {
        status: "error",
        statusCode: 400,
        message: `Puzzle ${puzzleName} in quest ${questName} is not awaiting activation`,
      };
    case "PUZZLE_NOT_IN_PROGRESS":
      return {
        status: "error",
        statusCode: 400,
        message: `Puzzle ${puzzleName} in quest ${questName} is not in progress`,
      };
    case "WRONG_ACTIVATION_CODE":
      return {
        status: "error",
        statusCode: 406,
        message: "Incorrect activation code for puzzle",
      };
    case "WRONG_SOLUTION":
      return {
        status: "error",
        statusCode: 406,
        message: "Incorrect guess for puzzle solution",
      };
    default:
      // QUEST_NOT_STARTED; the other codes only come from starting a quest
      // or revealing a hint, which handle them before getting here.
      return {
        status: "error",
        statusCode: 400,
        message: `Quest ${questName} is not yet started`,
      };
  }
}

/**
 * Adds the details players' screens show to an action's events.
 * @param events the events
 * @param puzzle the puzzle the action was on, if any
 * @returns the events with their details
 */
async function describeEvents(
  events: readonly QuestEvent[],
  puzzle?: PuzzleService.Puzzle
): Promise<PublishedQuestEvent[]> {
  const described: PublishedQuestEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case "PuzzleSolved":
        described.push({
          ...event,
          solutionText: puzzle?.solutionDisplayText ?? "",
        });
        break;
      case "PuzzleStarted": {
        const startedPuzzle = await PuzzleService.getPuzzleByPuzzleName(
          event.puzzleName
        );
        // Fall back to the name if the puzzle has since been deleted; the
        // action has already been saved.
        described.push({
          ...event,
          displayName: startedPuzzle.data?.displayName ?? event.puzzleName,
        });
        break;
      }
      case "HintRevealed": {
        const nextHint = puzzle?.hints.at(event.hintIndex + 1);
        described.push({
          ...event,
          hintText: puzzle?.hints.at(event.hintIndex)?.text ?? "",
          moreHints: nextHint !== undefined,
          isNextHintSolution: nextHint?.solutionWarning ?? false,
        });
        break;
      }
      default:
        described.push(event);
    }
  }
  return described;
}

/**
 * Describes an action's events and publishes them.
 * @param questName the name of the quest
 * @param origin who or what caused the action
 * @param events the events
 * @param puzzle the puzzle the action was on, if any
 * @returns the published events
 */
async function publishActivity(
  questName: string,
  origin: QuestActionOrigin,
  events: readonly QuestEvent[],
  puzzle?: PuzzleService.Puzzle
): Promise<PublishedQuestEvent[]> {
  const described = await describeEvents(events, puzzle);
  await questEventBus.publish({ ...origin, questName, events: described });
  return described;
}

/**
 * Starts a quest, making the first puzzle available for activation.
 * @param name the name of the quest to start
 * @param origin who or what started the quest
 * @returns a response object containing a status, status code, and data
 */
export async function startQuest(
  name: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(name, null, noRules, start);
  if (outcome.status === "refused") {
    return {
      status: "error",
      statusCode: 400,
      message:
        outcome.error === "NO_PUZZLES"
          ? `Quest ${name} cannot be started; it has no puzzles`
          : `Quest ${name} cannot be started; status is ${outcome.state.status}`,
    };
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(name, origin, outcome.events);
  return { status: "success", statusCode: 200 };
}

/**
 * Resets a quest to its initial state.
 * @param questName the name of the quest
 * @param origin who reset the quest
 * @returns a response object containing a status, status code, and data
 */
export async function resetQuest(
  questName: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(questName, null, noRules, reset);
  if (outcome.status === "error") {
    return outcome;
  }
  if (outcome.status === "refused") {
    throw new Error(`The rules refused to reset quest ${questName}`);
  }
  await publishActivity(questName, origin, outcome.events);
  return { status: "success", statusCode: 200 };
}

/**
 * Activates a puzzle in the quest, moving it from "awaiting activation" to "in progress"
 * @param questName the name of the quest for which to activate the puzzle
 * @param puzzleName the name of the puzzle within the quest to activate
 * @param userContexts an array of all of the contexts (user names and team names) for the user requesting activation
 * @param activationCode the activation code of the puzzle
 * @param origin who activated the puzzle, and from which browser connection
 * @returns a response object containing a status, status code, and data
 */
export async function activatePuzzle(
  questName: string,
  puzzleName: string,
  userContexts: string[],
  activationCode: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<{ activationTime: Date }>> {
  const outcome = await applyQuestAction(
    questName,
    { userContexts, action: "activate puzzles" },
    noRules,
    (state, now) => activate(state, puzzleName, activationCode, now)
  );
  if (outcome.status === "refused") {
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome.events);
  return {
    status: "success",
    statusCode: 200,
    data: { activationTime: outcome.now },
  };
}

/**
 * Finishes the specified puzzle, if the provided solution is correct.
 * @param questName the name of the quest containing the puzzle to finish
 * @param puzzleName the name of the puzzle to finish
 * @param userContexts an array of all of the contexts (user names and team names) for the user attempting to solve
 * @param solutionGuess the guess for the solution of the puzzle
 * @param origin who solved the puzzle, and from which browser connection
 * @returns a response object containing a status, status code, and data
 */
export async function finishPuzzle(
  questName: string,
  puzzleName: string,
  userContexts: string[],
  solutionGuess: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<PuzzleSolution>> {
  const outcome = await applyQuestAction(
    questName,
    { userContexts, action: "solve puzzles" },
    () => loadPuzzleRules(puzzleName),
    (state, now, puzzle) =>
      submitSolution(
        state,
        puzzleName,
        solutionGuess,
        toPuzzleRules(puzzle),
        now
      )
  );
  if (outcome.status === "refused") {
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }

  const events = await publishActivity(
    questName,
    origin,
    outcome.events,
    outcome.rules
  );
  const solution: PuzzleSolution = {
    endTime: outcome.now,
    solutionText: outcome.rules.solutionDisplayText,
  };
  for (const event of events) {
    if (event.type === "PuzzleStarted") {
      solution.nextPuzzleName = event.puzzleName;
      solution.nextPuzzleDisplayName = event.displayName;
    } else if (event.type === "QuestCompleted") {
      solution.questComplete = true;
    }
  }
  return { status: "success", statusCode: 200, data: solution };
}

/**
 * Gets the next hint in the named puzzle for the specified quest.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle for which to get the next hint
 * @param userContexts an array of all of the contexts (user names and team names) for the user attempting to solve
 * @param origin who requested the hint, and from which browser connection
 * @returns a response object containing a status, status code, and data;
 *  the data is false when every hint has already been revealed
 */
export async function getPuzzleHint(
  questName: string,
  puzzleName: string,
  userContexts: string[],
  origin: QuestActionOrigin = {}
): Promise<QuestResult<PuzzleHintResult | false>> {
  const outcome = await applyQuestAction(
    questName,
    { userContexts, action: "request puzzle hints" },
    () => loadPuzzleRules(puzzleName),
    (state, now, puzzle) =>
      revealHint(state, puzzleName, toPuzzleRules(puzzle), now)
  );
  if (outcome.status === "refused") {
    if (outcome.error === "NO_MORE_HINTS") {
      return { status: "success", statusCode: 200, data: false };
    }
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }

  const events = await publishActivity(
    questName,
    origin,
    outcome.events,
    outcome.rules
  );
  const hint = events.find((event) => event.type === "HintRevealed");
  if (!hint) {
    throw new Error("Revealing a hint reported no HintRevealed event");
  }
  return {
    status: "success",
    statusCode: 200,
    data: {
      hintText: hint.hintText,
      moreHints: hint.moreHints,
      timePenalty: hint.timePenalty,
      isNextHintSolution: hint.isNextHintSolution,
    },
  };
}

/**
 * Generates a QR code for activating the specified puzzle.
 * @param questName the quest containing the puzzle
 * @param puzzleName the puzzle for which to generate the activation QR code
 * @returns a response object containing a status, status code, and data
 */
export async function getPuzzleActivationQrCode(
  questName: string,
  puzzleName: string
): Promise<QuestResult<Buffer>> {
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
      message: getErrorMessage(err),
    };
  }
}

/**
 * Gets the quest run book, a PDF containing the puzzles in printed form.
 * @param questName name of the quest for which to generate the run book
 * @param pdfDoc the PDF document that will be populated with the quest information
 * @returns a promise resolving to the status of the operation
 */
export async function getQuestRunBook(
  questName: string,
  pdfDoc: PDFKit.PDFDocument
): Promise<QuestResult<undefined>> {
  const quest = await QuestModel.findOne({ name: questName });
  if (quest === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No quest with quest name ${questName} found`,
    };
  }

  try {
    for (const puzzle of quest.puzzles) {
      const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(
        puzzle.puzzleName
      );
      if (puzzleResult.status === "error") {
        throw new Error(puzzleResult.message);
      }
      const puzzleDetail = puzzleResult.data;
      pdfDoc.addPage({ margins: { top: 72, left: 72, right: 72, bottom: 36 } });
      pdfDoc.fontSize(18);
      pdfDoc.text(puzzleDetail.displayName, { align: "center" });
      pdfDoc.fontSize(10);
      pdfDoc.moveDown();
      if (puzzleDetail.type === 0) {
        new marked.Lexer({ gfm: true })
          .lex(puzzleDetail.text)
          .forEach((token) => processMarkdownToken(token, pdfDoc));
        pdfDoc.text("");
      } else if (puzzleDetail.type === 1) {
        const image = path.join(publicDirectory, puzzleDetail.text);
        pdfDoc.image(image, {
          fit: [72 * 6.5, 72 * 8.5],
          align: "center",
          valign: "center",
        });
      } else {
        pdfDoc.text(
          "Puzzle content is audio or video and cannot be rendered on paper."
        );
      }
    }
    pdfDoc.end();
  } catch (err) {
    return { status: "error", statusCode: 500, message: getErrorMessage(err) };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Recursively processes a markdown token for rendering in a PDF.
 * @param token the markdown token to process
 * @param pdfDoc the PDF document into which to render the token
 */
function processMarkdownToken(
  token: Token & { tokens?: Token[] },
  pdfDoc: PDFKit.PDFDocument
) {
  if (token.type === "paragraph" || token.type === "space") {
    pdfDoc.text("");
    pdfDoc.moveDown();
  }
  if (token.type === "codespan") {
    pdfDoc
      .font("Courier")
      .text(token.text, { continued: true })
      .font("Helvetica");
  }
  if (token.type === "code") {
    pdfDoc
      .font("Courier")
      .text(token.text, { align: "center" })
      .font("Helvetica")
      .fontSize(10);
  }
  if (token.type === "text" || token.type === "escape") {
    const text = token.text.replace(
      /&#x([\dA-Fa-f]+);/gi,
      function (match: string, numStr: string) {
        const num = parseInt(numStr, 16);
        return String.fromCharCode(num);
      }
    );
    pdfDoc.text(text, { continued: true });
  }
  token.tokens?.forEach((token) => {
    processMarkdownToken(token, pdfDoc);
  });
}

/**
 * Sets the expected response from an incoming text message and the corresponding confirmation.
 * @param questName name of the quest for which to set the expected response
 * @param expectedResponse expected text message response from a quest user
 * @param responseConfirmation the confirmation to send when the correct response is received
 * @returns a response object containing a status, status code, and data
 */
export async function setExpectedTextResponse(
  questName: string,
  expectedResponse: string,
  responseConfirmation: string
): Promise<QuestResult<undefined>> {
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
      message: getErrorMessage(err),
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Validates the text response sent by a user, case insensitively.
 * @param questName the name of the quest to check for the text response
 * @param textResponse the text response to validate
 * @returns a response object containing a status, status code, and data
 */
export async function validateExpectedTextResponse(
  questName: string,
  textResponse: string
): Promise<QuestResult<string>> {
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
