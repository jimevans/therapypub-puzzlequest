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

/** The properties a Quest is created from: a stored quest, or a request. */
export type QuestProperties = Pick<Quest, "name" | "displayName" | "status"> & {
  assignee: Omit<QuestAssignee, "id"> & { id: string | Types.ObjectId };
} & Partial<
    Pick<Quest, "textResponse" | "textResponseConfirmation" | "visibility">
  > & {
    puzzles?: QuestPuzzleProperties[];
    pauses?: readonly Pause[];
  };

/**
 * A quest's progress on a puzzle as stored: the puzzle is referred to by its
 * ID, and its name is looked up when the quest is loaded.
 */
type StoredQuestPuzzle = Omit<QuestPuzzleProperties, "puzzleName"> & {
  puzzleId: Types.ObjectId;
};

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
      skipped: this.skipped,
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

  /**
   * Gets the serialized representation of this QuestPuzzle that the players
   * may see. It leaves out the activation code, which players must get by
   * scanning the puzzle's QR code; the hints not yet revealed, which would
   * avoid their time penalties; and the solution, until the puzzle is solved.
   * @returns the object to be serialized to JSON
   */
  toPlayerJSON(): Record<string, unknown> {
    const { activationCode, ...visible } = this.toJSON();
    if (this.puzzleDetail) {
      visible.hints = this.puzzleDetail.hints.slice(0, this.nextHintToDisplay);
      if (this.status !== QuestPuzzleStatus.COMPLETED) {
        delete visible.solutionDisplayText;
      }
    }
    return visible;
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
    this.displayName = questDefinition.displayName;
    this.visibility = questDefinition.visibility ?? "public";
    this.assignee = {
      ...questDefinition.assignee,
      id: questDefinition.assignee.id.toString(),
    };
    this.status = questDefinition.status;
    this.textResponse = questDefinition.textResponse;
    this.textResponseConfirmation = questDefinition.textResponseConfirmation;
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

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this Quest.
   * @returns the object to be serialized to JSON
   */
  toJSON(): QuestJSON {
    return {
      name: this.name,
      displayName: this.displayName,
      visibility: this.visibility,
      assignee: this.assignee,
      status: this.status,
      statusDescription: this.statusDescription,
      textResponse: this.textResponse,
      textResponseConfirmation: this.textResponseConfirmation,
      paused: this.paused,
      puzzles: this.puzzles,
      progress: this.getProgress(),
    };
  }

  /**
   * Gets the serialized representation of this Quest that the players may
   * see. It leaves out the text reply the quest is waiting for, and shows
   * each puzzle as its players may see it.
   * @returns the object to be serialized to JSON
   */
  toPlayerJSON(): QuestPlayerJSON {
    return {
      name: this.name,
      displayName: this.displayName,
      assignee: this.assignee,
      status: this.status,
      statusDescription: this.statusDescription,
      paused: this.paused,
      puzzles: this.puzzles.map((puzzle) => puzzle.toPlayerJSON()),
      progress: this.getProgress(),
    };
  }
}

/** The JSON representation of a Quest. */
export type QuestJSON = Pick<
  Quest,
  | "name"
  | "displayName"
  | "visibility"
  | "assignee"
  | "status"
  | "statusDescription"
  | "textResponse"
  | "textResponseConfirmation"
  | "paused"
  | "puzzles"
> & {
  /** How long the players have spent on the quest. */
  progress: QuestProgress;
};

/** The JSON representation of a Quest that its players may see. */
export type QuestPlayerJSON = Pick<
  Quest,
  | "name"
  | "displayName"
  | "assignee"
  | "status"
  | "statusDescription"
  | "paused"
> & { puzzles: Record<string, unknown>[]; progress: QuestProgress };

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
  /** The user or team the quest is assigned to, by name. */
  assignee?: { kind: AssigneeKind; name: string };
  /**
   * The puzzles in the quest, in order. An activation code may be given to
   * set or change a puzzle's code; otherwise one is generated.
   */
  puzzles?: { puzzleName: string; activationCode?: string }[];
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
    displayName: true,
    visibility: true,
    assignee: true,
    status: true,
    textResponse: true,
    textResponseConfirmation: true,
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
  pipelineStages.push({ $match: matchParam }, { $sort: { _id: 1 } });
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

/**
 * Finds the user or team to assign a quest to, by name.
 * @param assignee the kind and name of the user or team
 * @returns the assignee as stored, or an error result if there is no such
 *  user or team
 */
async function findAssignee(assignee: {
  kind: AssigneeKind;
  name: string;
}): Promise<{ kind: AssigneeKind; id: Types.ObjectId } | QuestErrorResult> {
  const found =
    assignee.kind === "user"
      ? await UserModel.findOne({ userName: assignee.name }, { _id: 1 }).lean()
      : await TeamModel.findOne({ teamName: assignee.name }, { _id: 1 }).lean();
  if (!found) {
    return {
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: `No ${assignee.kind} with name ${assignee.name} found`,
    };
  }
  return { kind: assignee.kind, id: found._id };
}

/**
 * Gets a page of the quests, in the order they were created, with their
 * puzzles' details.
 * @param query the page wanted
 * @returns the page of quests
 */
export async function listQuestsPage(query: PageQuery): Promise<Page<Quest>> {
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
  return { items: found.data ?? [], next: page.next };
}

/**
 * Gets a page of the quests assigned to any of the given users and teams, once
 * they have started, as a player sees them listed.
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
          "assignee.id": {
            $in: assigneeIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
          status: { $gte: QuestStatus.IN_PROGRESS },
        },
        { _id: 1 }
      ).lean(),
    query
  );
  if (!page.items.length) {
    return { items: [], next: null };
  }
  const found = await findQuests(
    { questIds: page.items.map((quest) => quest._id) },
    true
  );
  return { items: found.data ?? [], next: page.next };
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
): Promise<
  QuestResult<
    Page<{
      type: string;
      at: Date;
      puzzleName?: string | null;
      actor?: string | null;
      actorDeleted?: boolean;
      data?: unknown;
    }>
  >
> {
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
        ({ type, at, puzzleName, actor, actorDeleted, data }) => ({
          type,
          at,
          ...(puzzleName ? { puzzleName } : {}),
          ...(actor ? { actor } : {}),
          ...(actorDeleted ? { actorDeleted: true } : {}),
          ...(data ? { data } : {}),
        })
      ),
    },
  };
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
    queryOptions.assigneeIds = await user.getAssigneeIds();
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
 * Gets a quest and one of its puzzles.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle in the quest
 * @param user the user and teams for which to retrieve quests; omit for no filtering
 * @returns a result containing the quest and the puzzle, or an error result
 *  if either isn't found (or the user may not see it)
 */
export async function getQuestAndPuzzle(
  questName: string,
  puzzleName: string,
  user?: User | null
): Promise<QuestResult<{ quest: Quest; puzzle: QuestPuzzle }>> {
  const queryResult = await getQuestByQuestName(questName, user);
  if (queryResult.status === "error") {
    return queryResult;
  }
  const quest = queryResult.data;
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

/**
 * Gets a quest as the public may see it: with only the puzzles its players
 * have reached, because a player can look at anything public, and players
 * must never learn how long a quest is.
 * @param questName the name of the quest
 * @returns a result containing the quest, or an error result if it isn't found
 */
export async function getSpectatedQuest(
  questName: string,
  viewer: User | null = null,
  shareToken?: string
): Promise<QuestResult> {
  const found = await findQuests(
    { questName, puzzleStatus: QuestPuzzleStatus.AWAITING_ACTIVATION },
    true
  );
  if (found.status === "error") {
    return found;
  }
  const quest = found.data[0];
  const allowed =
    (await mayFollow(quest, viewer)) ||
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
  return { status: "success", statusCode: 200, data: quest };
}

/**
 * Whether someone may follow a quest from outside it.
 * @param quest the quest
 * @param viewer who's asking, or null if they aren't signed in
 * @returns true if the quest is public, or they're staff or it's assigned to
 *  them or their team
 */
async function mayFollow(quest: Quest, viewer: User | null): Promise<boolean> {
  if (quest.visibility === "public") {
    return true;
  }
  return viewer !== null && isQuestMember(quest.assignee.id, viewer);
}

/**
 * Gets one of a quest's puzzles as the public may see it, once its players
 * have activated it. The answer is the same whether a puzzle isn't in the
 * quest or hasn't been activated, so a name can't be tried to learn which.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param viewer who's asking, or null if they aren't signed in
 * @param shareToken the share link's token they hold, if any
 * @returns a result containing the quest, the puzzle, and its definition, or
 *  an error result if they aren't found
 */
export async function getSpectatedQuestPuzzle(
  questName: string,
  puzzleName: string,
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
  const quest = found.data;
  const puzzle = quest.getPuzzle(puzzleName);
  // A puzzle deleted after it was added to the quest has no details.
  if (!puzzle?.puzzleDetail || puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No puzzle named ${puzzleName} found for quest ${questName}`,
    };
  }
  return {
    status: "success",
    statusCode: 200,
    data: { quest, puzzle, detail: puzzle.puzzleDetail },
  };
}

/**
 * Gets one of a quest's puzzles.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle in the quest to retrieve
 * @param user the user and teams for which to retrieve quests; omit for no filtering
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
 * Creates a new quest puzzle entry that has not yet been made available.
 * @param puzzleId the ID of the puzzle
 * @returns the quest puzzle data
 */
function createQuestPuzzleEntry(puzzleId: Types.ObjectId): StoredQuestPuzzle {
  return {
    puzzleId,
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
      reason: "invalid-quest",
      message: "Quest definition must contain a name or display name",
    };
  }
  if (!questDefinition.assignee) {
    return {
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: "Quest definition must contain a user or team to assign it to",
    };
  }
  const assignee = await findAssignee(questDefinition.assignee);
  if ("status" in assignee) {
    return assignee;
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
  const quest = new QuestModel({
    name: questName,
    displayName: questDefinition.displayName || questName,
    visibility: questDefinition.visibility ?? "public",
    assignee,
    status: QuestStatus.NOT_STARTED,
    puzzles: [],
  });

  if (questDefinition.puzzles) {
    const puzzleNames = questDefinition.puzzles.map(
      (puzzleDefinition) => puzzleDefinition.puzzleName
    );
    const ids = await findQuestPuzzleIds(puzzleNames);
    if ("status" in ids) {
      return ids;
    }
    quest.puzzles.push(
      ...questDefinition.puzzles.map(({ puzzleName, activationCode }) => ({
        ...createQuestPuzzleEntry(puzzleIdOf(ids, puzzleName)),
        // A code given for the puzzle replaces the generated one.
        ...(activationCode ? { activationCode } : {}),
      }))
    );
  }
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
  await notifyPlayersOf([result.assignee]);
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a quest's name, assignee, and puzzle list. Progress can't be
 * edited: the status and each puzzle's progress and times change only
 * through the game's actions, such as starting or resetting the quest, and
 * are ignored here. Once the quest has started, the puzzles the players have
 * reached stay in place (see checkPuzzleListChange). Puzzles already in the
 * quest keep their progress; puzzles new to it start out unavailable. A
 * puzzle's activation code can be changed by giving it.
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
  const assignee = questDefinition.assignee
    ? await findAssignee(questDefinition.assignee)
    : undefined;
  if (assignee && "status" in assignee) {
    return assignee;
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
    const visibility = questDefinition.visibility ?? foundQuest.visibility;
    // Those following it may no longer be allowed to. A ticket is only checked
    // on subscribing, so they have to subscribe again to find out.
    const fewerMayFollow =
      visibility === "private" &&
      (foundQuest.visibility !== "private" ||
        (assignee !== undefined &&
          !assignee.id.equals(foundQuest.assignee?.id)));
    const formerAssignee = foundQuest.assignee
      ? { kind: foundQuest.assignee.kind, id: foundQuest.assignee.id }
      : undefined;
    foundQuest.visibility = visibility;
    if (questDefinition.displayName) {
      foundQuest.displayName = questDefinition.displayName;
    }
    if (assignee) {
      foundQuest.assignee = assignee;
    }
    if (questDefinition.puzzles && puzzleNames && puzzleIds) {
      const check = checkPuzzleListChange(
        toQuestState(foundQuest, await puzzleNamesOf(foundQuest)),
        puzzleNames
      );
      if (!check.ok) {
        return {
          status: "error",
          statusCode: 400,
          reason: "wrong-state",
          message:
            check.error === "QUEST_COMPLETED"
              ? `Quest ${questDefinition.name} is completed, so its puzzles can't change until it is reset`
              : `Puzzle ${check.puzzleName} has already been reached by the players, so it must stay in its place at the start of the quest`,
        };
      }
      const existingPuzzles = new Map(
        foundQuest.puzzles.map((puzzle) => [
          puzzle.puzzleId.toString(),
          puzzle.toObject(),
        ])
      );
      foundQuest.set(
        "puzzles",
        questDefinition.puzzles.map((puzzleDefinition) => {
          const puzzleId = puzzleIdOf(puzzleIds, puzzleDefinition.puzzleName);
          const puzzle: Record<string, unknown> =
            existingPuzzles.get(puzzleId.toString()) ??
            createQuestPuzzleEntry(puzzleId);
          if (puzzleDefinition.activationCode) {
            puzzle.activationCode = puzzleDefinition.activationCode;
          }
          return puzzle;
        })
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
    await notifyPlayersOf([formerAssignee, foundQuest.assignee]);
    return { status: "success", statusCode: 200 };
  }
  return questChangingError(questDefinition.name);
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
  /** The IDs of the player and the player's teams. */
  assigneeIds: string[];
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
      /** Whom the quest is assigned to, if anyone. */
      assignee?: AssigneeRef;
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
 * Gets a quest's progress in the form the rules work with.
 * @param quest the quest document
 * @param puzzleNames the names of the quest's puzzles, from puzzleNamesOf
 * @returns the quest's state
 */
function toQuestState(
  quest: QuestDocument,
  puzzleNames: readonly string[]
): QuestState {
  return {
    status: quest.status as QuestStatus,
    pauses: quest.pauses.map(({ startTime, endTime }) => ({
      startTime,
      endTime,
    })),
    puzzles: quest.puzzles.map((puzzle, index) => ({
      puzzleName: puzzleNames[index],
      status: puzzle.status as QuestPuzzleStatus,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      activationCode: puzzle.activationCode,
      startTime: puzzle.startTime,
      activationTime: puzzle.activationTime,
      endTime: puzzle.endTime,
      skipped: puzzle.skipped,
      penaltyFreeHints: puzzle.penaltyFreeHints,
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
  quest.set("pauses", state.pauses ?? []);
  state.puzzles.forEach((puzzle, index) => {
    const stored = quest.puzzles[index];
    stored.status = puzzle.status;
    stored.nextHintToDisplay = puzzle.nextHintToDisplay;
    stored.startTime = puzzle.startTime;
    stored.activationTime = puzzle.activationTime;
    stored.endTime = puzzle.endTime;
    stored.skipped = puzzle.skipped ?? false;
    stored.penaltyFreeHints = puzzle.penaltyFreeHints ?? 0;
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
        reason: "not-found",
        message: `No quest with quest name ${questName} found`,
      };
    }
    const assigneeId = quest.assignee?.id.toString();
    if (actor && !(assigneeId && actor.assigneeIds.includes(assigneeId))) {
      return {
        status: "error",
        statusCode: 403,
        reason: "forbidden",
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
    const state = toQuestState(quest, await puzzleNamesOf(quest));
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
      return unexpectedErrorResult("applyQuestAction", err);
    }
    return {
      status: "applied",
      state: result.state,
      events: result.events,
      now,
      rules: loaded.rules,
      ...(quest.assignee
        ? {
            assignee: {
              kind: quest.assignee.kind,
              id: quest.assignee.id.toString(),
            },
          }
        : {}),
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
 * @param applied the action's events, and whom the quest is assigned to
 * @param puzzle the puzzle the action was on, if any
 * @returns the published events
 */
async function publishActivity(
  questName: string,
  origin: QuestActionOrigin,
  applied: { events: readonly QuestEvent[]; assignee?: AssigneeRef },
  puzzle?: PuzzleService.Puzzle
): Promise<PublishedQuestEvent[]> {
  const described = await describeEvents(applied.events, puzzle);
  await questEventBus.publish({
    ...origin,
    questName,
    events: described,
    ...(applied.assignee ? { assignee: applied.assignee } : {}),
  });
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
  await publishActivity(questName, origin, outcome);
  return { status: "success", statusCode: 200 };
}

/**
 * Pauses a quest in progress, stopping its clocks; its players can't act
 * until it resumes.
 * @param questName the name of the quest
 * @param origin who paused the quest
 * @returns a response object containing a status, status code, and data
 */
export async function pauseQuest(
  questName: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(questName, null, noRules, pause);
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
 * Resumes a paused quest, restarting its clocks.
 * @param questName the name of the quest
 * @param origin who resumed the quest
 * @returns a response object containing a status, status code, and data
 */
export async function resumeQuest(
  questName: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(questName, null, noRules, resume);
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
 * Completes a puzzle the players are stuck on, without a penalty; the next
 * puzzle becomes available, or the quest is complete.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param origin who skipped the puzzle
 * @returns a response object containing a status, status code, and data
 */
export async function skipQuestPuzzle(
  questName: string,
  puzzleName: string,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    null,
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
 * Undoes a puzzle's completion, so the players solve it again; the puzzles
 * after it are no longer reached.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @param refundHints true to remove the penalties of the puzzle's revealed
 *  hints
 * @param origin who reset the puzzle
 * @returns a response object containing a status, status code, and data
 */
export async function resetQuestPuzzle(
  questName: string,
  puzzleName: string,
  refundHints: boolean,
  origin: QuestActionOrigin = {}
): Promise<QuestResult<undefined>> {
  const outcome = await applyQuestAction(
    questName,
    null,
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
 * Activates a puzzle in the quest, moving it from "awaiting activation" to "in progress"
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
    { assigneeIds, action: "activate puzzles" },
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
 * Finishes the specified puzzle, if the provided solution is correct.
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
    { assigneeIds, action: "solve puzzles" },
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
 * Gets the next hint in the named puzzle for the specified quest.
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
    { assigneeIds, action: "request puzzle hints" },
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
    const qrCodeData = await QRCode.toBuffer(puzzle.activationCode);
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
  // A single update, so it can't conflict with players' progress.
  let result;
  try {
    result = await QuestModel.updateOne(
      { name: questName },
      {
        $set: {
          textResponse: expectedResponse,
          textResponseConfirmation: responseConfirmation,
        },
      }
    );
  } catch (err) {
    return unexpectedErrorResult("setExpectedTextResponse", err);
  }
  if (result.matchedCount === 0) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No quest with quest name ${questName} found`,
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
      reason: "not-found",
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
  // Clear the expected response, unless it has changed since it was read;
  // a single update, so it can't conflict with players' progress.
  const cleared = await QuestModel.updateOne(
    { _id: quest._id, textResponse: quest.textResponse },
    { $set: { textResponse: "", textResponseConfirmation: "" } }
  );
  if (cleared.modifiedCount === 0) {
    return {
      status: "error",
      statusCode: 418,
      message: `Quest is not expecting a text response`,
    };
  }
  return {
    status: "success",
    statusCode: 200,
    data: questTextResponseConfirmation,
  };
}
