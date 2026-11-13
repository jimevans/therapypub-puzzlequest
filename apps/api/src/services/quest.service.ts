import { randomUUID } from "crypto";
import path from "path";
import { marked, type Token } from "marked";
import mongoose, { type PipelineStage, type Types } from "mongoose";
import QRCode from "qrcode";
import {
  type PuzzleRules,
  type QuestErrorCode,
  type QuestEvent,
  type QuestProgress,
  type Pause,
  type QuestState,
  type TransitionResult,
  activatePuzzle as activate,
  calculateProgress,
  checkPuzzleListChange,
  isPaused,
  pause,
  parseSolutionKeywords,
  rankEntries,
  reset,
  resetPuzzle,
  resume,
  revealHint,
  skipPuzzle,
  start,
  submitSolution,
} from "../domain/quest/index.js";
import {
  type PublishedQuestEvent,
  type QuestActionOrigin,
  questEventBus,
} from "../events/questEventBus.js";
import { type AssigneeRef, notifyPlayersOf } from "./playerUpdates.service.js";
import { disconnectQuestFollowers } from "./websocket.service.js";
import {
  deleteShareLinksOfQuest,
  findValidShareLink,
  isQuestMember,
} from "./shareLink.service.js";
import { PuzzleModel } from "../models/puzzle.model.js";
import { QuestEventModel } from "../models/questEvent.model.js";
import {
  type AssigneeKind,
  type ChallengeChannel,
  type QuestVisibility,
  QuestModel,
  QuestStatus,
  QuestPuzzleStatus,
} from "../models/quest.model.js";
import { TeamModel, UserModel } from "../models/user.model.js";
import { storageDirectory } from "../paths.js";
import type { ServiceResult } from "../types.js";
import { type Page, type PageQuery, findPage } from "../api/paging.js";
import * as PuzzleService from "./puzzle.service.js";
import type { User } from "./user.service.js";
import { unexpectedErrorResult } from "../errors.js";

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
  Partial<
    Pick<
      QuestPuzzle,
      | "startTime"
      | "endTime"
      | "activationTime"
      | "skipped"
      | "penaltyFreeHints"
      | "cardWord"
    >
  >;

/**
 * The user or team a quest is assigned to. The name and display name are
 * looked up when the quest is read; they are missing if the user or team has
 * been deleted.
 */
export interface QuestAssignee {
  kind: AssigneeKind;
  /** The ID of the user or team. */
  id: string;
  /** The user name or team name. */
  name?: string;
  /** The display name of the user or team. */
  displayName?: string;
}

/** A message the puzzle master sent an entry's players. */
export interface EntryMessage {
  text: string;
  sentAt: Date;
  /** The challenge it set, if it was one. */
  challengeId?: Types.ObjectId | string;
}

/** A challenge sent to an entry, as it was sent, and its answer if any. */
export interface EntryChallenge {
  challengeId: Types.ObjectId | string;
  message: string;
  /** The keywords a right answer contains, separated by commas. */
  answer: string;
  confirmation: string;
  sentAt: Date;
  answeredAt?: Date;
  answeredBy?: Types.ObjectId | string;
  answeredVia?: ChallengeChannel;
}

/** The properties a Quest is created from: a stored quest, or a request. */
export type QuestProperties = Pick<Quest, "name" | "displayName" | "status"> & {
  /** The entry this is the quest as seen through, and its place in the list. */
  entryId?: string | Types.ObjectId;
  entryIndex?: number;
  assignee: Omit<QuestAssignee, "id"> & { id: string | Types.ObjectId };
} & Partial<
    Pick<Quest, "visibility" | "messages" | "challenge" | "textAppPlayers">
  > & {
    puzzles?: QuestPuzzleProperties[];
    pauses?: readonly Pause[];
  };

/**
 * A quest's progress on a puzzle as the find pipeline returns it: a stop and
 * the entry's progress on it, merged. The puzzle is referred to by its ID,
 * and its name is looked up when the quest is loaded.
 */
type StoredQuestPuzzle = Omit<QuestPuzzleProperties, "puzzleName"> & {
  puzzleId: Types.ObjectId;
};

/** A quest document loaded from the data store. */
type QuestDocument = InstanceType<typeof QuestModel>;

/** One of a quest document's entries. */
type EntryDocument = QuestDocument["entries"][number];

/**
 * Gets the user or team playing an entry. Every entry has one; the schema
 * can't say so of a nested object.
 * @param entry the entry
 * @returns the user or team
 */
function assigneeOf(entry: EntryDocument): {
  kind: AssigneeKind;
  id: Types.ObjectId;
} {
  if (!entry.assignee) {
    throw new Error(`Entry ${entry._id.toString()} has no user or team`);
  }
  return entry.assignee;
}

/**
 * Whether a quest is a race not every entry has finished: it has several
 * entries, and not all have completed it. While it is, only staff and each
 * entry's own players may see that entry's stops (see decision 0011).
 * @param entries the quest's entries, stored or as loaded
 * @returns true if so
 */
export function isRacing(entries: readonly { status: number }[]): boolean {
  return (
    entries.length > 1 &&
    entries.some((entry) => entry.status !== QuestStatus.COMPLETED)
  );
}

/** A user or team playing a quest, by name, as requests name it. */
export interface EntrantRef {
  kind: AssigneeKind;
  name: string;
}

/**
 * Which of a quest's entries an administrator's action applies to: the entry
 * of a named user or team, an entry by its ID, or every entry.
 */
export type EntryTarget = { entrant: EntrantRef } | { entryId: string } | "all";

/**
 * A new stop: a puzzle, with a generated activation code.
 * @param puzzleId the ID of the puzzle
 * @returns the stop
 */
function createStop(puzzleId: Types.ObjectId): {
  puzzleId: Types.ObjectId;
  activationCode: string;
  cardWord?: string;
} {
  return { puzzleId, activationCode: randomUUID().replaceAll("-", "") };
}

/**
 * An entry's progress on a puzzle it hasn't reached.
 * @param puzzleId the ID of the puzzle
 * @returns the progress
 */
function freshProgress(puzzleId: Types.ObjectId) {
  return {
    puzzleId,
    nextHintToDisplay: 0,
    status: QuestPuzzleStatus.UNAVAILABLE,
  };
}

/** A quest as returned by the findQuests aggregation, with puzzle details. */
type AggregatedQuest = Omit<QuestProperties, "puzzles"> & {
  puzzles: (StoredQuestPuzzle & {
    details?: PuzzleService.PuzzleDefinition;
  })[];
};

/**
 * The name used for a quest's puzzle whose puzzle no longer exists. Puzzles
 * a quest uses can't be deleted, so this happens only to data stored before
 * that rule.
 * @param puzzleId the ID the quest refers to the puzzle by
 * @returns the name
 */
function missingPuzzleName(puzzleId: Types.ObjectId): string {
  return `deleted-puzzle-${puzzleId.toString()}`;
}

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

  /** The word or phrase printed on the stop's QR card, if it has one. */
  cardWord?: string;

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

  /** True if an administrator skipped the puzzle rather than it being solved. */
  skipped: boolean;

  /** How many of the revealed hints an administrator refunded. */
  penaltyFreeHints: number;

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
    if (puzzleDefinition.cardWord) {
      this.cardWord = puzzleDefinition.cardWord;
    }
    this.startTime = puzzleDefinition.startTime;
    this.endTime = puzzleDefinition.endTime;
    this.activationTime = puzzleDefinition.activationTime;
    this.skipped = puzzleDefinition.skipped ?? false;
    this.penaltyFreeHints = puzzleDefinition.penaltyFreeHints ?? 0;
    switch (this.status) {
      case QuestPuzzleStatus.AWAITING_ACTIVATION:
        this.statusDescription = "Awaiting activation";
        break;
      case QuestPuzzleStatus.IN_PROGRESS:
        this.statusDescription = "In progress";
        break;
      case QuestPuzzleStatus.COMPLETED:
        this.statusDescription = this.skipped ? "Skipped" : "Completed";
        break;
      default:
        this.statusDescription = "Unavailable";
        break;
    }
  }
}

/**
 * A quest as seen through one of its entries: the quest's definition, with
 * the entry's player or team and progress. A quest is loaded as one of these
 * for each of its entries, in the entries' order.
 */
export class Quest {
  /**
   * Gets or sets the unique name of the quest.
   */
  name: string;

  /**
   * The ID of the entry this quest is seen through: a quest is loaded once
   * for each user or team playing it, with that entry's progress.
   */
  entryId: string;

  /** The entry's place in the quest's list of entries, from 0. */
  entryIndex: number;

  /**
   * Gets or sets the display name of this quest.
   */
  displayName: string;

  /** The user or team assigned to this quest. */
  assignee: QuestAssignee;

  /**
   * The status of this quest.
   */
  status: number;

  /**
   * Gets or sets the text description of the status of this quest.
   */
  statusDescription: string;

  /**
   * What the puzzle master has sent the entry's players, oldest first.
   */
  messages: readonly EntryMessage[];

  /** The challenge last sent to the entry, answered or not. */
  challenge?: EntryChallenge;

  /** True if players who have the app are texted too; false by default. */
  textAppPlayers: boolean;

  /**
   * The keywords of the challenge the entry is waiting to answer; empty if
   * none is waiting.
   */
  get textResponse(): string {
    return this.challenge && !this.challenge.answeredAt
      ? this.challenge.answer
      : "";
  }

  /**
   * The confirmation of the challenge the entry is waiting to answer; empty
   * if none is waiting.
   */
  get textResponseConfirmation(): string {
    return this.challenge && !this.challenge.answeredAt
      ? this.challenge.confirmation
      : "";
  }

  /**
   * The list of puzzles assigned to this quest.
   */
  puzzles: QuestPuzzle[] = [];

  /** The times an administrator paused the quest, in order. */
  pauses: readonly Pause[];

  /** True if an administrator has paused the quest. */
  paused: boolean;
  /** Who can follow the quest. */
  visibility: QuestVisibility;

  /**
   * Initializes a new instance of the Quest class.
   * @param questDefinition an object containing the definition of quest properties
   */
  constructor(questDefinition: QuestProperties) {
    this.name = questDefinition.name;
    this.entryId = questDefinition.entryId?.toString() ?? "";
    this.entryIndex = questDefinition.entryIndex ?? 0;
    this.displayName = questDefinition.displayName;
    this.visibility = questDefinition.visibility ?? "public";
    this.assignee = {
      ...questDefinition.assignee,
      id: questDefinition.assignee.id.toString(),
    };
    this.status = questDefinition.status;
    this.messages = questDefinition.messages ?? [];
    this.challenge = questDefinition.challenge ?? undefined;
    this.textAppPlayers = questDefinition.textAppPlayers ?? false;
    if (questDefinition.puzzles) {
      this.puzzles = questDefinition.puzzles.map(
        (puzzle) => new QuestPuzzle(puzzle)
      );
    }
    this.pauses = questDefinition.pauses ?? [];
    this.paused = isPaused({
      status: this.status as QuestStatus,
      puzzles: [],
      pauses: this.pauses,
    });
    switch (this.status) {
      case QuestStatus.NOT_STARTED:
        this.statusDescription = "Not yet started";
        break;
      case QuestStatus.IN_PROGRESS:
        this.statusDescription = this.paused ? "Paused" : "In progress";
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
   * Calculates how long the players have spent on this quest and each of its
   * puzzles. Hint penalties come from the puzzles' details, so a quest loaded
   * without them counts none.
   * @param now the current time
   * @returns the quest's progress
   */
  getProgress(now: Date = new Date()): QuestProgress {
    const hints = new Map(
      this.puzzles.flatMap((puzzle) =>
        puzzle.puzzleDetail
          ? [[puzzle.puzzleName, puzzle.puzzleDetail.hints] as const]
          : []
      )
    );
    return calculateProgress(
      {
        status: this.status as QuestStatus,
        pauses: this.pauses,
        puzzles: this.puzzles.map((puzzle) => ({
          puzzleName: puzzle.puzzleName,
          status: puzzle.status as QuestPuzzleStatus,
          nextHintToDisplay: puzzle.nextHintToDisplay,
          activationCode: puzzle.activationCode,
          startTime: puzzle.startTime,
          activationTime: puzzle.activationTime,
          endTime: puzzle.endTime,
          skipped: puzzle.skipped,
          penaltyFreeHints: puzzle.penaltyFreeHints,
        })),
      },
      hints,
      now
    );
  }
}

/**
 * Options for querying quests. Every option is optional.
 */
export interface QuestQueryOptions {
  /** The name of the quest to retrieve. */
  questName?: string;
  /** The IDs of the quests to retrieve. */
  questIds?: Types.ObjectId[];
  /** The IDs of the users and teams for which to retrieve quests. */
  assigneeIds?: string[];
  /** The status that the quest must be greater than or equal to be included in the result. */
  questStatus?: number;
  /** The status that quest puzzles must be greater than or equal to be included in the returned quests. */
  puzzleStatus?: number;
}

/**
 * The definition of a quest to create or update. Properties left out of an
 * update keep their stored values. Progress isn't part of a definition: it
 * changes only through the game's actions.
 */
export interface QuestDefinition {
  /** The unique name of the quest. */
  name?: string;
  /** The name of the quest shown to players. */
  displayName?: string;
  /** Who can follow the quest; new quests are public unless this says not. */
  visibility?: QuestVisibility;
  /**
   * True to text players who have the app the puzzle master's messages too;
   * new quests don't.
   */
  textAppPlayers?: boolean;
  /**
   * The users and teams playing the quest, by name, in order; at least one.
   * On an update, those already playing keep their progress, those new to it
   * start out not started, and those left out are removed, which is allowed
   * only before they start.
   */
  entrants?: EntrantRef[];
  /**
   * The puzzles in the quest, in order. An activation code may be given to
   * set or change a puzzle's code; otherwise one is generated. A card word
   * sets the word on the stop's QR card; an empty one removes it, and leaving
   * it out keeps it as it is.
   */
  puzzles?: {
    puzzleName: string;
    activationCode?: string;
    cardWord?: string;
  }[];
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
  /** The time penalty for the hint, in seconds. */
  timePenalty: number;
  /** The puzzle's next hint, or null if this was its last. */
  nextHint: { timePenalty: number; solutionWarning: boolean } | null;
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
  if (queryOptions?.assigneeIds) {
    errorMessage.push("assigned to the user or one of their teams");
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
  if (queryOptions?.questIds) {
    matchParam._id = { $in: queryOptions.questIds };
  }
  return matchParam;
}

/**
 * Generates the match parameter for an entry's progress, applied once each
 * quest's entry is merged into it.
 * @param queryOptions the query options for the quest
 * @returns an object representing the match criteria
 */
function createFindProgressMatchParameter(
  queryOptions?: QuestQueryOptions
): object {
  const matchParam: Record<string, unknown> = {};
  if (queryOptions?.assigneeIds) {
    // Limit results to only quests assigned to one of the specified users
    // or teams.
    matchParam["assignee.id"] = {
      $in: queryOptions.assigneeIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      ),
    };
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
    localField: "puzzles.puzzleId",
    foreignField: "_id",
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
                      $eq: ["$$this._id", "$$questPuzzle.puzzleId"],
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
    entryId: true,
    entryIndex: true,
    displayName: true,
    visibility: true,
    assignee: true,
    status: true,
    messages: true,
    challenge: true,
    textAppPlayers: true,
    pauses: true,
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
  // Each entry's progress is merged into the quest's own shape: who plays it,
  // its status, and each stop with the entry's progress on it.
  pipelineStages.push(
    { $unwind: { path: "$entries", includeArrayIndex: "entryIndex" } },
    {
      $addFields: {
        entryId: "$entries._id",
        assignee: "$entries.assignee",
        status: "$entries.status",
        messages: "$entries.messages",
        challenge: "$entries.challenge",
        pauses: "$entries.pauses",
        puzzles: {
          $map: {
            input: "$puzzles",
            as: "stop",
            in: {
              $mergeObjects: [
                {
                  nextHintToDisplay: 0,
                  status: QuestPuzzleStatus.UNAVAILABLE,
                  skipped: false,
                  penaltyFreeHints: 0,
                },
                {
                  $ifNull: [
                    {
                      $first: {
                        $filter: {
                          input: "$entries.puzzles",
                          cond: { $eq: ["$$this.puzzleId", "$$stop.puzzleId"] },
                        },
                      },
                    },
                    {},
                  ],
                },
                "$$stop",
              ],
            },
          },
        },
      },
    },
    { $match: createFindProgressMatchParameter(queryOptions) },
    { $sort: { _id: 1, entryIndex: 1 } }
  );
  // Quests refer to their puzzles by ID; the puzzles' details, including
  // their names, are looked up.
  const puzzleDetailsParams = createFindPuzzleDetailsParameters();
  pipelineStages.push({ $lookup: puzzleDetailsParams.lookupParam });
  pipelineStages.push({ $addFields: puzzleDetailsParams.addFieldsParam });
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
      reason: "not-found",
      message: `no quests found${
        returnedError ? " matching " + returnedError : ""
      }`,
    };
  }
  const quests = foundQuests.map((foundQuest) => {
    const quest = new Quest({
      ...foundQuest,
      puzzles: foundQuest.puzzles.map(({ puzzleId, details, ...progress }) => ({
        ...progress,
        puzzleName: details?.name ?? missingPuzzleName(puzzleId),
      })),
    });
    if (includeExtendedAttributes) {
      foundQuest.puzzles.forEach(({ details }, index) => {
        // A puzzle deleted after it was added to the quest has no details.
        if (details) {
          quest.puzzles[index].puzzleDetail = new PuzzleService.Puzzle(details);
        }
      });
    }
    return quest;
  });
  await describeAssignees(quests);
  return { status: "success", statusCode: 200, data: quests };
}

/**
 * Fills in the names and display names of the users and teams the quests
 * are assigned to, with one query for each kind.
 * @param quests the quests
 */
async function describeAssignees(quests: Quest[]): Promise<void> {
  const idsOf = (kind: AssigneeKind) => [
    ...new Set(
      quests
        .filter((quest) => quest.assignee.kind === kind)
        .map((quest) => quest.assignee.id)
    ),
  ];
  const userIds = idsOf("user");
  const teamIds = idsOf("team");
  const [users, teams] = await Promise.all([
    userIds.length
      ? UserModel.find(
          { _id: { $in: userIds } },
          { userName: 1, displayName: 1 }
        ).lean()
      : [],
    teamIds.length
      ? TeamModel.find(
          { _id: { $in: teamIds } },
          { teamName: 1, displayName: 1 }
        ).lean()
      : [],
  ]);
  const names = new Map<string, { name: string; displayName: string }>([
    ...users.map(
      (user) =>
        [
          `user:${user._id.toString()}`,
          { name: user.userName, displayName: user.displayName ?? "" },
        ] as const
    ),
    ...teams.map(
      (team) =>
        [
          `team:${team._id.toString()}`,
          { name: team.teamName, displayName: team.displayName },
        ] as const
    ),
  ]);
  for (const quest of quests) {
    Object.assign(
      quest.assignee,
      names.get(`${quest.assignee.kind}:${quest.assignee.id}`)
    );
  }
}

/** A user or team found to play a quest. */
interface FoundEntrant {
  kind: AssigneeKind;
  id: Types.ObjectId;
  name: string;
}

/**
 * Describes a user or team playing a quest, for messages: "team harbor" or
 * "user pat".
 * @param entrant the user or team
 * @returns the description
 */
function entrantLabel(entrant: { kind: AssigneeKind; name: string }): string {
  return `${entrant.kind} ${entrant.name}`;
}

/**
 * Looks up the names of users and teams playing quests, for messages.
 * @param assignees the users and teams, as entries store them
 * @returns their descriptions, such as "team harbor", in the same order; one
 *  that has been deleted is described by its ID
 */
async function entrantLabelsOf(
  assignees: readonly { kind: AssigneeKind; id: Types.ObjectId }[]
): Promise<string[]> {
  const [users, teams] = await Promise.all([
    UserModel.find(
      {
        _id: {
          $in: assignees.filter((a) => a.kind === "user").map((a) => a.id),
        },
      },
      { userName: 1 }
    ).lean(),
    TeamModel.find(
      {
        _id: {
          $in: assignees.filter((a) => a.kind === "team").map((a) => a.id),
        },
      },
      { teamName: 1 }
    ).lean(),
  ]);
  const names = new Map<string, string>([
    ...users.map((user) => [user._id.toString(), user.userName] as const),
    ...teams.map((team) => [team._id.toString(), team.teamName] as const),
  ]);
  return assignees.map((assignee) =>
    entrantLabel({
      kind: assignee.kind,
      name: names.get(assignee.id.toString()) ?? assignee.id.toString(),
    })
  );
}

/**
 * Finds the users and teams to play a quest, by name, and checks them: there
 * must be at least one, each must exist and appear once, and no player may
 * be in two of them, as a user and in a team, or in two teams.
 * @param entrants the kinds and names of the users and teams
 * @returns the entrants as stored, in the same order, or an error result
 */
async function findEntrants(
  entrants: readonly EntrantRef[]
): Promise<FoundEntrant[] | QuestErrorResult> {
  const invalid = (message: string): QuestErrorResult => ({
    status: "error",
    statusCode: 400,
    reason: "invalid-quest",
    field: "entrants",
    message,
  });
  if (!entrants.length) {
    return invalid(
      "Quest definition must contain at least one user or team to play it"
    );
  }
  const labels = entrants.map(entrantLabel);
  const repeated = labels.filter(
    (label, index) => labels.indexOf(label) !== index
  );
  if (repeated.length) {
    return invalid(
      `A user or team may play a quest only once: ${[...new Set(repeated)].join(", ")}`
    );
  }
  const found: (FoundEntrant & { playerIds: Types.ObjectId[] })[] = [];
  for (const entrant of entrants) {
    if (entrant.kind === "user") {
      const user = await UserModel.findOne(
        { userName: entrant.name },
        { _id: 1 }
      ).lean();
      if (!user) {
        return invalid(`No user with name ${entrant.name} found`);
      }
      found.push({ ...entrant, id: user._id, playerIds: [user._id] });
    } else {
      const team = await TeamModel.findOne(
        { teamName: entrant.name },
        { _id: 1, memberIds: 1 }
      ).lean();
      if (!team) {
        return invalid(`No team with name ${entrant.name} found`);
      }
      found.push({ ...entrant, id: team._id, playerIds: team.memberIds });
    }
  }
  // Each player's entrant, so a player in two of them is found.
  const entrantOfPlayer = new Map<string, FoundEntrant>();
  for (const entrant of found) {
    for (const playerId of entrant.playerIds) {
      const other = entrantOfPlayer.get(playerId.toString());
      if (other) {
        const player = await UserModel.findById(playerId, {
          userName: 1,
        }).lean();
        return invalid(
          `Player ${player?.userName ?? playerId.toString()} would be in two of the quest's entrants, ${entrantLabel(other)} and ${entrantLabel(entrant)}; a player may be in only one`
        );
      }
      entrantOfPlayer.set(playerId.toString(), entrant);
    }
  }
  return found.map(({ kind, id, name }) => ({ kind, id, name }));
}

/**
 * Finds the ID of a user or team, by name.
 * @param entrant the kind and name of the user or team
 * @returns the ID, or undefined if there is no such user or team
 */
async function findEntrantId(
  entrant: EntrantRef
): Promise<Types.ObjectId | undefined> {
  const found =
    entrant.kind === "user"
      ? await UserModel.findOne({ userName: entrant.name }, { _id: 1 }).lean()
      : await TeamModel.findOne({ teamName: entrant.name }, { _id: 1 }).lean();
  return found?._id;
}

/**
 * Groups quests, as findQuests returns them (one for each entry, sorted by
 * quest), into one list of entries for each quest.
 * @param rows the quests, one for each entry
 * @returns each quest's entries, in order
 */
export function groupEntriesByQuest(rows: readonly Quest[]): Quest[][] {
  const groups: Quest[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last[0].name === row.name) {
      last.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups;
}

/**
 * Gets a page of the quests, in the order they were created, each as its
 * entries, with their puzzles' details.
 * @param query the page wanted
 * @returns the page of quests, each a list of its entries
 */
export async function listQuestsPage(query: PageQuery): Promise<Page<Quest[]>> {
  const page = await findPage(
    (conditions) => QuestModel.find(conditions, { _id: 1 }).lean(),
    query
  );
  if (!page.items.length) {
    return { items: [], next: null };
  }
  const found = await findQuests(
    { questIds: page.items.map((quest) => quest._id) },
    true
  );
  return { items: groupEntriesByQuest(found.data ?? []), next: page.next };
}

/**
 * Gets a page of the quests that any of the given users and teams play, once
 * their entries have started, as a player sees them listed: each quest as
 * their entry, and no one else's.
 * @param assigneeIds the IDs of the users and teams
 * @param query the page wanted
 * @returns the page of quests
 */
export async function listAssignedQuestsPage(
  assigneeIds: string[],
  query: PageQuery
): Promise<Page<Quest>> {
  const page = await findPage(
    (conditions) =>
      QuestModel.find(
        {
          ...conditions,
          entries: {
            $elemMatch: {
              "assignee.id": {
                $in: assigneeIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
              status: { $gte: QuestStatus.IN_PROGRESS },
            },
          },
        },
        { _id: 1 }
      ).lean(),
    query
  );
  if (!page.items.length) {
    return { items: [], next: null };
  }
  const found = await findQuests(
    {
      questIds: page.items.map((quest) => quest._id),
      assigneeIds,
      questStatus: QuestStatus.IN_PROGRESS,
    },
    true
  );
  // A player in two of a quest's entries, which saving the quest prevents
  // but joining a team later can cause, sees the first.
  return {
    items: groupEntriesByQuest(found.data ?? []).map(([first]) => first),
    next: page.next,
  };
}

/** An event from a quest's log, as the log keeps it. */
export interface LoggedQuestEvent {
  /** What happened, such as PuzzleSolved (see QuestEvent). */
  type: string;
  at: Date;
  puzzleName?: string | null;
  actor?: string | null;
  actorDeleted?: boolean | null;
  /** Null for events logged before quests had several entries. */
  entrant?: { kind: AssigneeKind; name?: string | null } | null;
  data?: Record<string, unknown> | null;
}

/**
 * Gets a page of what happened in a quest, oldest first, from its event log.
 * The log keeps names as they were, as history.
 * @param questName the quest
 * @param query the page wanted
 * @returns the page of events, or an error result if there is no such quest
 */
export async function listQuestEventsPage(
  questName: string,
  query: PageQuery
): Promise<QuestResult<Page<LoggedQuestEvent>>> {
  if (!(await QuestModel.exists({ name: questName }))) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No quest with quest name ${questName} found`,
    };
  }
  const page = await findPage(
    (conditions) =>
      QuestEventModel.find(
        { questName, ...conditions },
        { questName: 0 }
      ).lean(),
    query
  );
  return {
    status: "success",
    statusCode: 200,
    data: {
      next: page.next,
      items: page.items.map(
        ({ type, at, puzzleName, actor, actorDeleted, entrant, data }) => ({
          type,
          at,
          puzzleName,
          actor,
          actorDeleted,
          entrant,
          data: data as Record<string, unknown> | null | undefined,
        })
      ),
    },
  };
}

/**
 * Gets a quest's entries: each as the quest seen through it, in order. An
 * administrator, or a caller giving no user, gets every entry. Any other user
 * gets only their own entry, or their team's, once it has started, with only
 * the puzzles it has reached; a quest they don't play is not found.
 * @param questName the name of the quest
 * @param user who's asking; omit for no filtering
 * @returns a result containing the entries, or an error result if none are
 *  found
 */
export async function getQuestEntries(
  questName: string,
  user?: User | null
): Promise<QuestResult<Quest[]>> {
  const queryOptions: QuestQueryOptions = { questName: questName };
  if (user && !user.isAdmin()) {
    queryOptions.assigneeIds = await user.getAssigneeIds();
    queryOptions.questStatus = QuestStatus.IN_PROGRESS;
    queryOptions.puzzleStatus = QuestPuzzleStatus.AWAITING_ACTIVATION;
  }
  return findQuests(queryOptions, true);
}

/**
 * The error for a player who is in two of a quest's entries, which saving the
 * quest prevents, but which joining a team later can cause.
 * @param questName the name of the quest
 * @param labels the entries' entrants, such as "team harbor"
 * @returns the error result
 */
function severalEntriesError(
  questName: string,
  labels: readonly string[]
): QuestErrorResult {
  return {
    status: "error",
    statusCode: 409,
    reason: "wrong-state",
    message: `You play quest ${questName} in more than one of its entrants (${labels.join(" and ")}), so which one you're acting for isn't clear; ask the puzzle master to correct the quest`,
  };
}

/**
 * Gets a quest, as seen through the asking player's own entry, and one of its
 * puzzles. An administrator who doesn't play the quest sees it through its
 * first entry.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle in the quest
 * @param user the user asking; omit for the first entry, unfiltered
 * @returns a result containing the quest and the puzzle, or an error result
 *  if either isn't found (or the user may not see it)
 */
export async function getQuestAndPuzzle(
  questName: string,
  puzzleName: string,
  user?: User | null
): Promise<QuestResult<{ quest: Quest; puzzle: QuestPuzzle }>> {
  const queryResult = await getQuestEntries(questName, user);
  if (queryResult.status === "error") {
    return queryResult;
  }
  let entries = queryResult.data;
  if (!user || user.isAdmin()) {
    const assigneeIds = user ? await user.getAssigneeIds() : [];
    const own = entries.filter((entry) =>
      assigneeIds.includes(entry.assignee.id)
    );
    entries = own.length ? own : entries.slice(0, 1);
  }
  if (entries.length > 1) {
    return severalEntriesError(
      questName,
      entries.map(({ assignee }) =>
        entrantLabel({
          kind: assignee.kind,
          name: assignee.name ?? assignee.id,
        })
      )
    );
  }
  const quest = entries[0];
  const puzzle = quest.getPuzzle(puzzleName);
  if (puzzle === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No puzzle named ${puzzleName} found for quest ${questName}`,
    };
  }
  return { status: "success", statusCode: 200, data: { quest, puzzle } };
}

/** One of a quest's entries in its place on the leaderboard. */
export interface RankedEntry {
  /** The quest, as seen through the entry. */
  quest: Quest;
  /** The entry's progress, measured when it was ranked. */
  progress: QuestProgress;
  /** Its rank once it has completed the quest; null until then. */
  rank: number | null;
}

/**
 * Ranks a quest's entries for its leaderboard (see rankEntries): those that
 * completed it by their scores, then those playing, then those yet to start.
 * @param entries the quest, as seen through each of its entries
 * @param now the time to measure running clocks to
 * @returns the entries in leaderboard order, and whether the ranks are
 *  provisional: some entry has one, and another could still beat it
 */
export function rankQuestEntries(
  entries: readonly Quest[],
  now: Date = new Date()
): { entries: RankedEntry[]; provisional: boolean } {
  const standings = rankEntries(
    entries.map((quest) => {
      const progress = quest.getProgress(now);
      return {
        quest,
        progress,
        status: quest.status as QuestStatus,
        totalMs: progress.totalMs,
      };
    })
  );
  return {
    entries: standings.entries.map(({ entry, rank }) => ({
      quest: entry.quest,
      progress: entry.progress,
      rank,
    })),
    provisional: standings.provisional,
  };
}

/** A quest as someone following it from outside may see it. */
export interface SpectatedQuest {
  /**
   * The entries the viewer may see, in leaderboard order, each with its
   * reached puzzles, progress, and rank.
   */
  entries: RankedEntry[];
  /** True while the quest is a race not every entry has finished. */
  racing: boolean;
  /**
   * True if the viewer may see only the standings, not the stops: while the
   * quest is racing, for anyone but staff and administrators.
   */
  stopsHidden: boolean;
  /**
   * True if the viewer sees only their own entry: while the quest is racing,
   * for a player (not staff) whose entry hasn't completed it.
   */
  rivalsHidden: boolean;
  /**
   * True while the ranks shown could still change: some entry shown has a
   * rank, and some entry hasn't completed. Never while rivals are hidden.
   */
  provisional: boolean;
}

/**
 * Gets a quest's entries as the public may see them: with only the puzzles
 * each has reached, because a player can look at anything public, and players
 * must never learn how long a quest is. While teams race, only staff may see
 * the stops: a rival could otherwise read the leaders' puzzles and answers.
 * And a player still racing sees only their own entry, not how their rivals
 * stand, until their entry completes the quest. The entries are in leaderboard
 * order, with their ranks.
 * @param questName the name of the quest
 * @param viewer who's asking, or null if they aren't signed in
 * @param shareToken the share link's token they hold, if any
 * @returns a result containing the entries, or an error result if the quest
 *  isn't found or they may not follow it
 */
export async function getSpectatedQuest(
  questName: string,
  viewer: User | null = null,
  shareToken?: string
): Promise<QuestResult<SpectatedQuest>> {
  const found = await findQuests(
    { questName, puzzleStatus: QuestPuzzleStatus.AWAITING_ACTIVATION },
    true
  );
  if (found.status === "error") {
    return found;
  }
  const entries = found.data;
  const allowed =
    (await mayFollow(entries, viewer)) ||
    (shareToken !== undefined &&
      (await findValidShareLink(shareToken, questName)) !== undefined);
  if (!allowed) {
    // The same answer as for a quest that doesn't exist, so that a name can't
    // be tried to learn whether there's a private quest by that name.
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `no quests found matching ${createFindErrorMessage({ questName })}`,
    };
  }
  const racing = isRacing(entries);
  const staff = viewer?.isStaff() ?? false;
  const standings = rankQuestEntries(entries);
  const own =
    racing && viewer !== null && !staff
      ? await ownEntries(standings.entries, viewer)
      : [];
  // A player who plays and is still racing; a share link they hold doesn't
  // change who they are.
  const rivalsHidden = own.some(
    ({ quest }) => quest.status !== QuestStatus.COMPLETED
  );
  return {
    status: "success",
    statusCode: 200,
    data: {
      entries: rivalsHidden ? own : standings.entries,
      racing,
      stopsHidden: racing && !staff,
      rivalsHidden,
      provisional: !rivalsHidden && standings.provisional,
    },
  };
}

/**
 * Finds the entries a user plays, theirs or their team's.
 * @param entries the quest's entries
 * @param user the user
 * @returns their entries, in the order given
 */
async function ownEntries<E extends { quest: Quest }>(
  entries: readonly E[],
  user: User
): Promise<E[]> {
  const assigneeIds = await user.getAssigneeIds();
  return entries.filter(({ quest }) => assigneeIds.includes(quest.assignee.id));
}

/**
 * Whether someone may follow a quest from outside it.
 * @param entries the quest's entries
 * @param viewer who's asking, or null if they aren't signed in
 * @returns true if the quest is public, or they're staff or play it in any
 *  of its entries
 */
async function mayFollow(
  entries: readonly Quest[],
  viewer: User | null
): Promise<boolean> {
  if (entries[0]?.visibility === "public") {
    return true;
  }
  if (viewer === null) {
    return false;
  }
  for (const entry of entries) {
    if (await isQuestMember(entry.assignee.id, viewer)) {
      return true;
    }
  }
  return false;
}

/**
 * Gets one of a quest's puzzles as the public may see it, once an entry's
 * players have activated it, and unless the quest is a race not every entry
 * has finished, when only staff may. The answer is the same whether a puzzle isn't in
 * the quest or the entry hasn't activated it, so a name can't be tried to
 * learn which.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param entryId the ID of the entry whose progress to show
 * @param viewer who's asking, or null if they aren't signed in
 * @param shareToken the share link's token they hold, if any
 * @returns a result containing the entry, the puzzle, and its definition, or
 *  an error result if they aren't found
 */
export async function getSpectatedQuestPuzzle(
  questName: string,
  puzzleName: string,
  entryId: string,
  viewer: User | null = null,
  shareToken?: string
): Promise<
  QuestResult<{
    quest: Quest;
    puzzle: QuestPuzzle;
    detail: PuzzleService.Puzzle;
  }>
> {
  const found = await getSpectatedQuest(questName, viewer, shareToken);
  if (found.status === "error") {
    return found;
  }
  const quest = found.data.entries.find(
    (entry) => entry.quest.entryId === entryId
  )?.quest;
  const puzzle = quest?.getPuzzle(puzzleName);
  // A puzzle deleted after it was added to the quest has no details. While
  // teams race, only staff may see the stops.
  if (
    found.data.stopsHidden ||
    !quest ||
    !puzzle?.puzzleDetail ||
    puzzle.status < QuestPuzzleStatus.IN_PROGRESS
  ) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No puzzle named ${puzzleName} found for that entry of quest ${questName}`,
    };
  }
  return {
    status: "success",
    statusCode: 200,
    data: { quest, puzzle, detail: puzzle.puzzleDetail },
  };
}

/**
 * Gets one of a quest's puzzles, as the asking player's entry has it.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle in the quest to retrieve
 * @param user the user asking; omit for the first entry, unfiltered
 * @returns a result containing the puzzle, or an error result if it isn't
 *  found (or the user may not see it)
 */
export async function getQuestPuzzle(
  questName: string,
  puzzleName: string,
  user?: User | null
): Promise<QuestResult<QuestPuzzle>> {
  const result = await getQuestAndPuzzle(questName, puzzleName, user);
  return result.status === "error"
    ? result
    : { status: "success", statusCode: 200, data: result.data.puzzle };
}

/**
 * Checks a quest's list of puzzles, and finds their IDs: each puzzle must
 * exist and appear only once.
 * @param puzzleNames the names of the puzzles in the quest
 * @returns the puzzles' IDs, by name, or an error result if the list isn't
 *  valid
 */
async function findQuestPuzzleIds(
  puzzleNames: string[]
): Promise<Map<string, Types.ObjectId> | QuestErrorResult> {
  const duplicates = puzzleNames.filter(
    (puzzleName, index) => puzzleNames.indexOf(puzzleName) !== index
  );
  if (duplicates.length) {
    return {
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: `Puzzles may appear only once in a quest: ${[
        ...new Set(duplicates),
      ].join(", ")}`,
    };
  }
  const foundPuzzles = await PuzzleModel.find(
    { name: { $in: puzzleNames } },
    { name: 1 }
  ).lean();
  const ids = new Map(foundPuzzles.map((puzzle) => [puzzle.name, puzzle._id]));
  const missing = puzzleNames.filter((puzzleName) => !ids.has(puzzleName));
  if (missing.length) {
    return {
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: `No puzzles found with names: ${missing.join(", ")}`,
    };
  }
  return ids;
}

/**
 * Gets the ID of one of a quest's puzzles, found by findQuestPuzzleIds.
 * @param ids the puzzles' IDs, by name
 * @param puzzleName the name of the puzzle
 * @returns the puzzle's ID
 */
function puzzleIdOf(
  ids: Map<string, Types.ObjectId>,
  puzzleName: string
): Types.ObjectId {
  const id = ids.get(puzzleName);
  if (!id) {
    throw new Error(`Puzzle ${puzzleName} was not found with the others`);
  }
  return id;
}

/**
 * A new entry for a user or team, not yet started, with fresh progress on
 * each of the quest's stops.
 * @param entrant the user or team
 * @param stops the quest's stops
 * @returns the entry
 */
function newEntry(
  entrant: Pick<FoundEntrant, "kind" | "id">,
  stops: readonly { puzzleId: Types.ObjectId }[]
) {
  return {
    assignee: { kind: entrant.kind, id: entrant.id },
    status: QuestStatus.NOT_STARTED,
    puzzles: stops.map((stop) => freshProgress(stop.puzzleId)),
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
      reason: "invalid-quest",
      message: "Quest definition must contain a name or display name",
    };
  }
  const entrants = await findEntrants(questDefinition.entrants ?? []);
  if ("status" in entrants) {
    return entrants;
  }
  const questExists = (await QuestModel.find({ name: questName })).length !== 0;
  if (questExists) {
    return {
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: `Quest with name ${questName} already exists`,
    };
  }
  const stops: ReturnType<typeof createStop>[] = [];
  if (questDefinition.puzzles) {
    const puzzleNames = questDefinition.puzzles.map(
      (puzzleDefinition) => puzzleDefinition.puzzleName
    );
    const ids = await findQuestPuzzleIds(puzzleNames);
    if ("status" in ids) {
      return ids;
    }
    stops.push(
      ...questDefinition.puzzles.map(
        ({ puzzleName, activationCode, cardWord }) => ({
          ...createStop(puzzleIdOf(ids, puzzleName)),
          // A code given for the puzzle replaces the generated one.
          ...(activationCode ? { activationCode } : {}),
          ...(cardWord ? { cardWord } : {}),
        })
      )
    );
  }
  const quest = new QuestModel({
    name: questName,
    displayName: questDefinition.displayName || questName,
    visibility: questDefinition.visibility ?? "public",
    textAppPlayers: questDefinition.textAppPlayers ?? false,
    puzzles: stops,
    entries: entrants.map((entrant) => newEntry(entrant, stops)),
  });
  try {
    await quest.save();
  } catch (err) {
    return unexpectedErrorResult("createQuest", err);
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
      reason: "not-found",
      message: `Quest with name ${name} does not exist`,
    };
  }
  await deleteShareLinksOfQuest(result._id);
  await notifyPlayersOf(result.entries.map((entry) => entry.assignee));
  return { status: "success", statusCode: 200 };
}

/**
 * Checks a new puzzle list against every entry of a quest: the puzzles any
 * entry has reached stay in place, and any entry having completed the quest
 * keeps the list as it is.
 * @param quest the quest document
 * @param puzzleNames the new list of puzzle names, in order
 * @returns an error result if the change isn't allowed; otherwise undefined
 */
async function checkPuzzleListForEntries(
  quest: QuestDocument,
  puzzleNames: readonly string[]
): Promise<QuestErrorResult | undefined> {
  const currentNames = await puzzleNamesOf(quest);
  for (const entry of quest.entries) {
    const check = checkPuzzleListChange(
      toQuestState(quest, entry, currentNames),
      puzzleNames
    );
    if (!check.ok) {
      const [entrant] = await entrantLabelsOf([assigneeOf(entry)]);
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message:
          check.error === "QUEST_COMPLETED"
            ? `Quest ${quest.name} is completed by ${entrant}, so its puzzles can't change until that entry is reset`
            : `Puzzle ${check.puzzleName} has already been reached by ${entrant}, so it must stay in its place at the start of the quest`,
      };
    }
  }
  return undefined;
}

/**
 * Updates a quest's name, entrants, and puzzle list. Progress can't be
 * edited: the status and each puzzle's progress and times change only
 * through the game's actions, such as starting or resetting the quest, and
 * are ignored here. Once an entry has started, the puzzles it has reached
 * stay in place (see checkPuzzleListChange). Puzzles already in the quest
 * keep every entry's progress; puzzles new to it start out unavailable. A
 * puzzle's activation code can be changed by giving it. Entrants already
 * playing keep their progress; new ones start out not started; one left out
 * is removed, but only before it starts.
 * @param questDefinition quest definition containing the updated data
 * @returns a response object containing a status, status code, and data
 */
export async function updateQuest(
  questDefinition: QuestDefinition & { name: string }
): Promise<QuestResult<undefined>> {
  const puzzleNames = questDefinition.puzzles?.map(
    (puzzle) => puzzle.puzzleName
  );
  const puzzleIds = puzzleNames
    ? await findQuestPuzzleIds(puzzleNames)
    : undefined;
  if (puzzleIds && "status" in puzzleIds) {
    return puzzleIds;
  }
  const entrants = questDefinition.entrants
    ? await findEntrants(questDefinition.entrants)
    : undefined;
  if (entrants && "status" in entrants) {
    return entrants;
  }
  for (let attempt = 0; attempt < MAX_QUEST_ACTION_ATTEMPTS; attempt++) {
    const foundQuest = await loadQuest(questDefinition.name);
    if (foundQuest === null) {
      return {
        status: "error",
        statusCode: 404,
        reason: "not-found",
        message: `No quest with quest name ${questDefinition.name} found`,
      };
    }
    const formerAssignees = foundQuest.entries.map(assigneeOf);
    const wanted = entrants
      ? new Set(entrants.map((entrant) => entrant.id.toString()))
      : undefined;
    const removed = wanted
      ? foundQuest.entries.filter(
          (entry) => !wanted.has(assigneeOf(entry).id.toString())
        )
      : [];
    const started = removed.filter(
      (entry) => entry.status !== QuestStatus.NOT_STARTED
    );
    if (started.length) {
      const labels = await entrantLabelsOf(started.map(assigneeOf));
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        field: "entrants",
        message: `${labels.join(", ")} ${started.length === 1 ? "has" : "have"} started quest ${questDefinition.name}, so can't be removed from it; reset ${started.length === 1 ? "it" : "them"} first`,
      };
    }
    const visibility = questDefinition.visibility ?? foundQuest.visibility;
    // Those following it may no longer be allowed to. A ticket is only checked
    // on subscribing, so they have to subscribe again to find out.
    const fewerMayFollow =
      visibility === "private" &&
      (foundQuest.visibility !== "private" || removed.length > 0);
    foundQuest.visibility = visibility;
    if (questDefinition.textAppPlayers !== undefined) {
      foundQuest.textAppPlayers = questDefinition.textAppPlayers;
    }
    if (questDefinition.displayName) {
      foundQuest.displayName = questDefinition.displayName;
    }
    if (questDefinition.puzzles && puzzleNames && puzzleIds) {
      const refused = await checkPuzzleListForEntries(foundQuest, puzzleNames);
      if (refused) {
        return refused;
      }
      const existingPuzzles = new Map(
        foundQuest.puzzles.map((puzzle) => [
          puzzle.puzzleId.toString(),
          puzzle.toObject(),
        ])
      );
      const newIds = questDefinition.puzzles.map((puzzleDefinition) =>
        puzzleIdOf(puzzleIds, puzzleDefinition.puzzleName)
      );
      // Every entry's progress follows the new order; puzzles new to the
      // quest start out unavailable.
      for (const each of foundQuest.entries) {
        const progress = new Map(
          each.puzzles.map((puzzle) => [
            puzzle.puzzleId.toString(),
            puzzle.toObject(),
          ])
        );
        each.set(
          "puzzles",
          newIds.map((id) => progress.get(id.toString()) ?? freshProgress(id))
        );
      }
      foundQuest.set(
        "puzzles",
        questDefinition.puzzles.map((puzzleDefinition, index) => {
          const puzzleId = newIds[index];
          const puzzle: Record<string, unknown> =
            existingPuzzles.get(puzzleId.toString()) ?? createStop(puzzleId);
          if (puzzleDefinition.activationCode) {
            puzzle.activationCode = puzzleDefinition.activationCode;
          }
          if (puzzleDefinition.cardWord !== undefined) {
            if (puzzleDefinition.cardWord) {
              puzzle.cardWord = puzzleDefinition.cardWord;
            } else {
              delete puzzle.cardWord;
            }
          }
          return puzzle;
        })
      );
    }
    if (entrants) {
      // Entrants already playing keep their entries, progress and all; new
      // ones start with fresh progress on every stop. The order is the one
      // given.
      const existing = new Map(
        foundQuest.entries.map((entry) => [
          assigneeOf(entry).id.toString(),
          entry.toObject(),
        ])
      );
      foundQuest.set(
        "entries",
        entrants.map(
          (entrant) =>
            existing.get(entrant.id.toString()) ??
            newEntry(entrant, foundQuest.puzzles)
        )
      );
    }
    try {
      await foundQuest.save();
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError) {
        continue;
      }
      return unexpectedErrorResult("updateQuest", err);
    }
    if (fewerMayFollow) {
      disconnectQuestFollowers(questDefinition.name);
    }
    // Its name or its players may have changed.
    await notifyPlayersOf([
      ...formerAssignees,
      ...foundQuest.entries.map(assigneeOf),
    ]);
    return { status: "success", statusCode: 200 };
  }
  return questChangingError(questDefinition.name);
}

/** The error branch of a quest service result. */
type QuestErrorResult = Extract<QuestResult<never>, { status: "error" }>;

/**
 * How many times an action is tried when another change to the same quest
 * (a teammate's, or another team's in a race) is saved between loading the
 * quest and saving it.
 */
const MAX_QUEST_ACTION_ATTEMPTS = 8;

/** A player acting on a quest. */
interface QuestActor {
  /** The IDs of the player and the player's teams. */
  assigneeIds: string[];
  /** What the player is doing, for the error message if they may not. */
  action: string;
}

/**
 * The entries an action applies to: the acting player's own, or for an
 * administrator, one user's or team's (by ID), one entry, or every entry.
 */
type ActionTarget =
  | { player: QuestActor }
  | { entrant: EntrantRef; id: Types.ObjectId | undefined }
  | { entryId: string }
  | "all";

/** What an action changed in one entry. */
interface EntryChange {
  /** The entry's ID. */
  entryId: string;
  /** The user or team playing in the entry. */
  assignee: AssigneeRef;
  /** The entry's new state. */
  state: QuestState;
  /** What happened. */
  events: readonly QuestEvent[];
}

/**
 * The outcome of applying an action to a quest: a service error (such as no
 * quest found), the rules refusing the action (for every entry it was
 * applied to), or the action saved.
 * @template R the puzzle rules the action used
 */
type QuestActionOutcome<R> =
  | QuestErrorResult
  | { status: "refused"; error: QuestErrorCode; state: QuestState }
  | {
      status: "applied";
      /** Each entry the rules allowed the action for, in order. */
      changes: EntryChange[];
      /** Whether the quest is a race not every entry has finished, after it. */
      racing: boolean;
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
 * Gets the names of a quest's puzzles, which the quest refers to by ID.
 * @param quest the quest document
 * @returns the puzzles' names, in the quest's order
 */
async function puzzleNamesOf(quest: QuestDocument): Promise<string[]> {
  const ids = quest.puzzles.map((puzzle) => puzzle.puzzleId);
  const found = await PuzzleModel.find(
    { _id: { $in: ids } },
    { name: 1 }
  ).lean();
  const names = new Map(
    found.map((puzzle) => [puzzle._id.toString(), puzzle.name])
  );
  return ids.map((id) => names.get(id.toString()) ?? missingPuzzleName(id));
}

/**
 * Gets an entry's progress through a quest in the form the rules work with:
 * the quest's stops, in order, with the entry's progress on each.
 * @param quest the quest document
 * @param entry the entry
 * @param puzzleNames the names of the quest's puzzles, from puzzleNamesOf
 * @returns the entry's state
 */
function toQuestState(
  quest: QuestDocument,
  entry: EntryDocument,
  puzzleNames: readonly string[]
): QuestState {
  const progress = new Map(
    entry.puzzles.map((puzzle) => [puzzle.puzzleId.toString(), puzzle])
  );
  return {
    status: entry.status as QuestStatus,
    pauses: entry.pauses.map(({ startTime, endTime }) => ({
      startTime,
      endTime,
    })),
    puzzles: quest.puzzles.map((stop, index) => {
      const puzzle = progress.get(stop.puzzleId.toString());
      return {
        puzzleName: puzzleNames[index],
        status: (puzzle?.status ??
          QuestPuzzleStatus.UNAVAILABLE) as QuestPuzzleStatus,
        nextHintToDisplay: puzzle?.nextHintToDisplay ?? 0,
        activationCode: stop.activationCode,
        startTime: puzzle?.startTime,
        activationTime: puzzle?.activationTime,
        endTime: puzzle?.endTime,
        skipped: puzzle?.skipped ?? false,
        penaltyFreeHints: puzzle?.penaltyFreeHints ?? 0,
      };
    }),
  };
}

/**
 * Copies an entry's new progress onto it. The rules never add, remove, or
 * reorder puzzles, so the state's puzzles line up with the quest's stops.
 * @param quest the quest document
 * @param entry the entry
 * @param state the entry's new state
 */
function applyQuestState(
  quest: QuestDocument,
  entry: EntryDocument,
  state: QuestState
): void {
  entry.status = state.status;
  entry.set("pauses", state.pauses ?? []);
  if (state.status === QuestStatus.NOT_STARTED) {
    // A reset: the puzzle master's messages and challenge go with the rest
    // of the entry's progress.
    entry.set("messages", []);
    entry.set("challenge", undefined);
  }
  entry.set(
    "puzzles",
    state.puzzles.map((puzzle, index) => ({
      puzzleId: quest.puzzles[index].puzzleId,
      status: puzzle.status,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      startTime: puzzle.startTime,
      activationTime: puzzle.activationTime,
      endTime: puzzle.endTime,
      skipped: puzzle.skipped ?? false,
      penaltyFreeHints: puzzle.penaltyFreeHints ?? 0,
    }))
  );
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
 * Finds the entries of a quest an action applies to.
 * @param quest the quest document
 * @param target the entries the action applies to
 * @returns the entries, in the quest's order, or an error result if the
 *  player plays in none or several, or there is no such entry
 */
async function entriesFor(
  quest: QuestDocument,
  target: ActionTarget
): Promise<EntryDocument[] | QuestErrorResult> {
  if (target === "all") {
    return [...quest.entries];
  }
  if ("player" in target) {
    const { assigneeIds, action } = target.player;
    const own = quest.entries.filter((entry) =>
      assigneeIds.includes(assigneeOf(entry).id.toString())
    );
    if (!own.length) {
      return {
        status: "error",
        statusCode: 403,
        reason: "forbidden",
        message: `User is not authorized to ${action} for quest ${quest.name}`,
      };
    }
    if (own.length > 1) {
      return severalEntriesError(
        quest.name,
        await entrantLabelsOf(own.map(assigneeOf))
      );
    }
    return own;
  }
  const entry =
    "entryId" in target
      ? quest.entries.find((each) => each._id.toString() === target.entryId)
      : target.id &&
        quest.entries.find((each) => assigneeOf(each).id.equals(target.id));
  if (!entry) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message:
        "entryId" in target
          ? `Quest ${quest.name} has no entry ${target.entryId}`
          : `${entrantLabel(target.entrant)} isn't playing quest ${quest.name}`,
    };
  }
  return [entry];
}

/**
 * Gets the action target for an administrator's entry target, finding a
 * named user's or team's ID.
 * @param target the entries an administrator's action applies to
 * @returns the action's target
 */
async function toActionTarget(target: EntryTarget): Promise<ActionTarget> {
  if (target === "all" || "entryId" in target) {
    return target;
  }
  return { entrant: target.entrant, id: await findEntrantId(target.entrant) };
}

/**
 * Applies an action to a quest: loads the quest, finds the entries it
 * applies to (checking that a player may act on their own), applies the
 * rules to each, and saves the result once. An entry the rules refuse the
 * action for is left as it is; if they refuse it for every entry, the action
 * is refused. If another change to the quest is saved first, the action
 * starts over with the updated quest, so the two can't overwrite each other.
 * @param questName the name of the quest
 * @param target the entries the action applies to
 * @param loadRules loads what the rules need; called once, after the player
 *  is authorized
 * @param transition applies the rules
 * @returns the outcome
 */
async function applyQuestAction<R>(
  questName: string,
  target: ActionTarget,
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
        reason: "not-found",
        message: `No quest with quest name ${questName} found`,
      };
    }
    const entries = await entriesFor(quest, target);
    if ("status" in entries) {
      return entries;
    }
    if (!loaded) {
      const rulesResult = await loadRules();
      if ("status" in rulesResult) {
        return rulesResult;
      }
      loaded = rulesResult;
    }
    const now = new Date(Date.now());
    const puzzleNames = await puzzleNamesOf(quest);
    const changes: EntryChange[] = [];
    let refusal: { error: QuestErrorCode; state: QuestState } | undefined;
    for (const entry of entries) {
      const state = toQuestState(quest, entry, puzzleNames);
      const result = transition(state, now, loaded.rules);
      if (!result.ok) {
        refusal ??= { error: result.error, state };
        continue;
      }
      applyQuestState(quest, entry, result.state);
      changes.push({
        entryId: entry._id.toString(),
        assignee: {
          kind: assigneeOf(entry).kind,
          id: assigneeOf(entry).id.toString(),
        },
        state: result.state,
        events: result.events,
      });
    }
    if (!changes.length) {
      if (!refusal) {
        return {
          status: "error",
          statusCode: 400,
          reason: "wrong-state",
          message: `Quest ${questName} has no entrants`,
        };
      }
      return { status: "refused", ...refusal };
    }
    try {
      await quest.save();
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError) {
        continue;
      }
      return unexpectedErrorResult("applyQuestAction", err);
    }
    return {
      status: "applied",
      changes,
      racing: isRacing(quest.entries),
      now,
      rules: loaded.rules,
    };
  }
  return questChangingError(questName);
}

/**
 * The error for an action that kept conflicting with other changes to the
 * quest.
 * @param questName the name of the quest
 * @returns the error result
 */
function questChangingError(questName: string): QuestErrorResult {
  return {
    status: "error",
    statusCode: 409,
    reason: "busy",
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
        reason: "wrong-state",
        message: `Quest ${questName} is already completed`,
      };
    case "PUZZLE_NOT_FOUND":
      return {
        status: "error",
        statusCode: 404,
        reason: "not-found",
        message: `No puzzle with name ${puzzleName} in quest ${questName}`,
      };
    case "PUZZLE_NOT_AWAITING_ACTIVATION":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message: `Puzzle ${puzzleName} in quest ${questName} is not awaiting activation`,
      };
    case "PUZZLE_NOT_IN_PROGRESS":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message: `Puzzle ${puzzleName} in quest ${questName} is not in progress`,
      };
    case "WRONG_ACTIVATION_CODE":
      return {
        status: "error",
        statusCode: 406,
        reason: "wrong-activation-code",
        message: "Incorrect activation code for puzzle",
      };
    case "WRONG_SOLUTION":
      return {
        status: "error",
        statusCode: 406,
        reason: "wrong-answer",
        message: "Incorrect guess for puzzle solution",
      };
    case "PUZZLE_COMPLETED":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message: `Puzzle ${puzzleName} in quest ${questName} is already completed`,
      };
    case "PUZZLE_NOT_COMPLETED":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message: `Puzzle ${puzzleName} in quest ${questName} hasn't been completed, so there is nothing to reset`,
      };
    case "QUEST_PAUSED":
      return {
        status: "error",
        statusCode: 409,
        reason: "quest-paused",
        message: `Quest ${questName} is paused by the puzzle master; please wait until it resumes`,
      };
    default:
      // QUEST_NOT_STARTED; the other codes only come from starting a quest
      // or revealing a hint, which handle them before getting here.
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
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
          displayName: puzzle?.displayName ?? event.puzzleName,
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
          nextHint: nextHint
            ? {
                timePenalty: nextHint.timePenalty,
                solutionWarning: nextHint.solutionWarning,
              }
            : null,
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
 * Describes an action's events and publishes them, one activity for each
 * entry it changed.
 * @param questName the name of the quest
 * @param origin who or what caused the action
 * @param applied what the action changed in each entry, and whether the
 *  quest is a race afterwards
 * @param puzzle the puzzle the action was on, if any
 * @returns the published events, for each entry in turn
 */
async function publishActivity(
  questName: string,
  origin: QuestActionOrigin,
  { changes, racing }: { changes: readonly EntryChange[]; racing: boolean },
  puzzle?: PuzzleService.Puzzle
): Promise<PublishedQuestEvent[][]> {
  const published: PublishedQuestEvent[][] = [];
  for (const change of changes) {
    const described = await describeEvents(change.events, puzzle);
    await questEventBus.publish({
      ...origin,
      questName,
      entry: { id: change.entryId, assignee: change.assignee },
      racing,
      events: described,
    });
    published.push(described);
  }
  return published;
}

/**
 * Starts a quest, making the first puzzle available for activation: for one
 * entry, or for every entry not yet started.
 * @param name the name of the quest to start
 * @param origin who or what started the quest
 * @param target the entries to start; every entry, if left out
 * @returns a response object containing a status, status code, and data
 */
export async function startQuest(
  name: string,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    name,
    await toActionTarget(target),
    noRules,
    start
  );
  if (outcome.status === "refused") {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message:
        outcome.error === "NO_PUZZLES"
          ? `Quest ${name} cannot be started; it has no puzzles`
          : `Quest ${name} cannot be started; status is ${outcome.state.status}`,
    };
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(name, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Resets a quest to its initial state: one entry, or every entry.
 * @param questName the name of the quest
 * @param origin who reset the quest
 * @param target the entries to reset; every entry, if left out
 * @returns a response object containing a status, status code, and data
 */
export async function resetQuest(
  questName: string,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    await toActionTarget(target),
    noRules,
    reset
  );
  if (outcome.status === "error") {
    return outcome;
  }
  if (outcome.status === "refused") {
    throw new Error(`The rules refused to reset quest ${questName}`);
  }
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Pauses a quest in progress, stopping its clocks; its players can't act
 * until it resumes. Pausing every entry pauses those in progress and not
 * already paused.
 * @param questName the name of the quest
 * @param origin who paused the quest
 * @param target the entries to pause; every entry, if left out
 * @returns a response object containing a status, status code, and data
 */
export async function pauseQuest(
  questName: string,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    await toActionTarget(target),
    noRules,
    pause
  );
  if (outcome.status === "refused") {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message:
        outcome.error === "QUEST_PAUSED"
          ? `Quest ${questName} is already paused`
          : `Quest ${questName} can be paused only while it is in progress`,
    };
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Resumes a paused quest, restarting its clocks. Resuming every entry
 * resumes those paused.
 * @param questName the name of the quest
 * @param origin who resumed the quest
 * @param target the entries to resume; every entry, if left out
 * @returns a response object containing a status, status code, and data
 */
export async function resumeQuest(
  questName: string,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    await toActionTarget(target),
    noRules,
    resume
  );
  if (outcome.status === "refused") {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: `Quest ${questName} isn't paused`,
    };
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Completes a puzzle an entry's players are stuck on, without a penalty; the
 * next puzzle becomes available, or the entry's quest is complete.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param origin who skipped the puzzle
 * @param target the entries to skip it for; every entry that can, if left
 *  out
 * @returns a response object containing a status, status code, and data
 */
export async function skipQuestPuzzle(
  questName: string,
  puzzleName: string,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    await toActionTarget(target),
    noRules,
    (state, now) => skipPuzzle(state, puzzleName, now)
  );
  if (outcome.status === "refused") {
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Undoes a puzzle's completion, so an entry's players solve it again; the
 * puzzles after it are no longer reached.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param refundHints true to remove the penalties of the puzzle's revealed
 *  hints
 * @param origin who reset the puzzle
 * @param target the entries to reset it for; every entry that can, if left
 *  out
 * @returns a response object containing a status, status code, and data
 */
export async function resetQuestPuzzle(
  questName: string,
  puzzleName: string,
  refundHints: boolean,
  origin: QuestActionOrigin = {},
  target: EntryTarget = "all"
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    await toActionTarget(target),
    noRules,
    (state, now) => resetPuzzle(state, puzzleName, refundHints, now)
  );
  if (outcome.status === "refused") {
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Activates a puzzle in the player's entry, moving it from "awaiting
 * activation" to "in progress".
 * @param questName the name of the quest for which to activate the puzzle
 * @param puzzleName the name of the puzzle within the quest to activate
 * @param assigneeIds the IDs of the user and the user's teams, for the user requesting activation
 * @param activationCode the activation code of the puzzle
 * @param origin who activated the puzzle, and from which browser connection
 * @returns a response object containing a status, status code, and data
 */
export async function activatePuzzle(
  questName: string,
  puzzleName: string,
  assigneeIds: string[],
  activationCode: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<{ activationTime: Date }>> {
  const outcome = await applyQuestAction(
    questName,
    { player: { assigneeIds, action: "activate puzzles" } },
    noRules,
    (state, now) => activate(state, puzzleName, activationCode, now)
  );
  if (outcome.status === "refused") {
    return puzzleActionRefused(outcome.error, questName, puzzleName);
  }
  if (outcome.status === "error") {
    return outcome;
  }
  await publishActivity(questName, origin, outcome);
  return {
    status: "success",
    statusCode: 200,
    data: { activationTime: outcome.now },
  };
}

/**
 * Finishes the specified puzzle in the player's entry, if the provided
 * solution is correct.
 * @param questName the name of the quest containing the puzzle to finish
 * @param puzzleName the name of the puzzle to finish
 * @param assigneeIds the IDs of the user and the user's teams, for the user attempting to solve
 * @param solutionGuess the guess for the solution of the puzzle
 * @param origin who solved the puzzle, and from which browser connection
 * @returns a response object containing a status, status code, and data
 */
export async function finishPuzzle(
  questName: string,
  puzzleName: string,
  assigneeIds: string[],
  solutionGuess: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<PuzzleSolution>> {
  const outcome = await applyQuestAction(
    questName,
    { player: { assigneeIds, action: "solve puzzles" } },
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

  const [events] = await publishActivity(
    questName,
    origin,
    outcome,
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
 * Reveals the next hint of a puzzle in the player's entry.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle for which to get the next hint
 * @param assigneeIds the IDs of the user and the user's teams, for the user attempting to solve
 * @param origin who requested the hint, and from which browser connection
 * @returns a response object containing a status, status code, and data;
 *  the data is false when every hint has already been revealed
 */
export async function getPuzzleHint(
  questName: string,
  puzzleName: string,
  assigneeIds: string[],
  origin: QuestActionOrigin = {}
): Promise<QuestResult<PuzzleHintResult | false>> {
  const outcome = await applyQuestAction(
    questName,
    { player: { assigneeIds, action: "request puzzle hints" } },
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

  const [events] = await publishActivity(
    questName,
    origin,
    outcome,
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
      timePenalty: hint.timePenalty,
      nextHint: hint.nextHint,
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
      reason: "not-found",
      message: `No quest with quest name ${questName} found`,
    };
  }

  const index = (await puzzleNamesOf(quest)).indexOf(puzzleName);
  if (index === -1) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No puzzle with name ${puzzleName} in quest ${questName}`,
    };
  }
  const puzzle = quest.puzzles[index];
  try {
    // Large enough to stay sharp on a tablet's screen or printed.
    const qrCodeData = await QRCode.toBuffer(puzzle.activationCode, {
      width: 600,
    });
    return { status: "success", statusCode: 200, data: qrCodeData };
  } catch (err) {
    return unexpectedErrorResult("getPuzzleActivationQrCode", err);
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
      reason: "not-found",
      message: `No quest with quest name ${questName} found`,
    };
  }

  try {
    for (const puzzleName of await puzzleNamesOf(quest)) {
      const puzzleResult =
        await PuzzleService.getPuzzleByPuzzleName(puzzleName);
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
        const image = path.join(storageDirectory, puzzleDetail.text);
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
    return unexpectedErrorResult("getQuestRunBook", err);
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
 * The error for an entry that isn't found.
 * @param questName the name of the quest
 * @returns the error result
 */
export function noSuchEntryError(questName: string): QuestErrorResult {
  return {
    status: "error",
    statusCode: 404,
    reason: "not-found",
    message: `No quest with quest name ${questName} and that entry found`,
  };
}
