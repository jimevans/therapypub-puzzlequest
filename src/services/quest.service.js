import { QuestModel as Quest } from "../models/quest.model.js";
import { QuestPuzzleModel as QuestPuzzle } from "../models/quest.model.js";
import { QuestStatus, QuestPuzzleStatus } from "../models/quest.model.js";
import * as UserService from "./user.service.js";

function getCurrentPuzzleIndex(quest) {
  let currentPuzzleIndex = 0;
  while (
    currentPuzzleIndex < quest.puzzles.length &&
    quest.puzzles[currentPuzzleIndex].status !==
      QuestPuzzleStatus.AWAITING_ACTIVATION
  ) {
    currentPuzzleIndex++;
  }
  return currentPuzzleIndex;
}

export async function createQuest(questDefinition) {
  let questName = "";
  if ("name" in questDefinition) {
    questName = questDefinition.name;
  } else if ("displayName" in questDefinition) {
    questName = questDefinition.displayName.replace(" ", ".").toLowerCase();
  } else {
    return { error: "Quest definition must contain a name or display name" };
  }
  if (!("userName" in questDefinition)) {
    // NOTE: This could lead to attempting to add a user name that does
    // not exist. This is to avoid a lookup of the user from the Users schema.
    // Consumers of this service will have to take that into account when
    // managing the implications of creating a quest.
    return { error: "Quest definition must contain a user name" };
  }
  const questExists = (await Quest.find({ name: questName })).length !== 0;
  if (questExists) {
    return { error: `Quest with name ${questName} already exists` };
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
        questOrder: puzzleCount,
        nextHintToDisplay: 0,
        status: QuestPuzzleStatus.UNAVAILABLE,
      };
      quest.puzzles.push(puzzle);
      puzzleCount++;
    });
  }
  await quest.save();
  return { status: "success" };
}

export async function deleteQuest(name) {
  const result = await Quest.findOneAndDelete({ name: name });
  if (result === null) {
    return { error: `User with user name ${name} does not exist` };
  }
  return { status: "success" };
}

export async function updateQuest(name, questDefinition) {
  const foundQuest = await Quest.findOne({ name: name });
  if (foundQuest === null) {
    return { error: `No quest with quest name ${name} found` };
  }
  if (questDefinition.name || questDefinition.displayName) {
    foundQuest.name = questDefinition.name || questDefinition.displayName.replace(" ", ".").toLowerCase();
    foundQuest.displayName = questDefinition.displayName || questDefinition.name;
  }
  foundQuest.userName = questDefinition.userName || foundQuest.userName;
  foundQuest.status = questDefinition.status || foundQuest.status;
  foundQuest.puzzles = questDefinition.puzzles || foundQuest.puzzles;
  await foundQuest.save();
  return { status: "success" };
}

export async function getQuests(user = null, status = -1) {
  const questFilter = {};
  if (status >= QuestStatus.NOT_STARTED) {
    questFilter.status = status;
  }
  if (user) {
    const userNameResponse = await UserService.getUserAndTeams(user);
    if ("error" in userNameResponse) {
      return userNameResponse;
    }
    questFilter.userName = { $in: userNameResponse.identifiers };
  }
  const foundQuests = await Quest.find(questFilter);
  return { status: "success", quests: foundQuests };
}

async function getQuestData(name, omitUnavailablePuzzles = false) {
  const foundQuests = await Quest.aggregate([
    { $match: { name: name } },
    { $limit: 1 },
    {
      $lookup: {
        from: "puzzles",
        localField: "puzzles.puzzleName",
        foreignField: "name",
        as: "puzzleDetails"
      }
    }
  ]);
  if (foundQuests.length === 0) {
    return { status: "success", quest: null };
  }
  // We should only ever have one here, so take the 0th one.
  const foundQuest = foundQuests[0];
  const questData = {
    name: foundQuest.name,
    displayName: foundQuest.displayName,
    userName: foundQuest.userName,
    status: foundQuest.status,
    puzzles: []
  }
  const foundPuzzles = foundQuest.puzzles.filter(puzzle => {
    if (!omitUnavailablePuzzles || (omitUnavailablePuzzles && puzzle.status >= QuestPuzzleStatus.AWAITING_ACTIVATION)) {
      return puzzle;
    }
  }).sort((a, b) => a.questOrder - b.questOrder);
  foundPuzzles.forEach(puzzle => {
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
      default:
        statusDescription = "Unavailable";
        break;
    }
    const detail = foundQuest.puzzleDetails.filter(puzzleDetail => puzzle.puzzleName === puzzleDetail.name)[0];
    questData.puzzles.push({
      name: puzzle.puzzleName,
      displayName: detail.displayName,
      solutionDisplayText: detail.solutionDisplayText,
      questOrder: puzzle.questOrder,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      status: puzzle.status,
      statusDescription: statusDescription,
      startTime: puzzle.startTime,
      endTime: puzzle.endTime,
      activationTime: puzzle.activationTime
    });
  });
  return { status: "success", quest: questData };
}

export async function getQuest(name) {
  const questData = await getQuestData(name);
  if (questData === null) {
    return { error: `No quest with name ${name} found` };
  }
  return { status: "success", quest: questData.quest };
}

export async function startQuest(name) {
  const quest = await getQuestData(name);
  if (quest === null) {
    return { error: `No quest with name ${name} found` };
  }

  if (quest.status !== QuestStatus.NOT_STARTED) {
    return {
      error: `Quest ${name} cannot be started; status is ${quest.status}`,
    };
  }
  quest.status = QuestStatus.IN_PROGRESS;
  quest.puzzles[0].status = QuestPuzzleStatus.AWAITING_ACTIVATION;
  quest.puzzles[0].startTime = new Date(Date.now());
  await quest.save();
  return { status: "success" };
}

export async function activatePuzzle(name) {
  const quest = await getQuestData(name);
  if (quest === null) {
    return { error: `No quest with name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return { error: `Quest ${name} is not yet started` };
  }

  const currentPuzzleIndex = getCurrentPuzzleIndex(quest);
  if (currentPuzzleIndex === quest.puzzles.length) {
    return { error: `No puzzles pending activation for quest ${name}` };
  }

  const currentTime = new Date(Date.now());
  quest.puzzles[currentPuzzleIndex].activationTime = currentTime;
  quest.puzzles[currentPuzzleIndex].status = QuestPuzzleStatus.IN_PROGRESS;
  await quest.save();
  return { status: "success" };
}

export async function finishPuzzle(name) {
  const quest = await getQuestData(name);
  if (quest === null) {
    return { error: `No quest with name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.IN_PROGRESS) {
    return { error: `Quest ${name} is not yet started` };
  }

  const currentPuzzleIndex = getCurrentPuzzleIndex(quest);
  const currentTime = new Date(Date.now());
  quest.puzzles[currentPuzzleIndex].endTime = currentTime;
  quest.puzzles[currentPuzzleIndex].status = QuestPuzzleStatus.COMPLETED;
  if (currentPuzzleIndex < quest.puzzles.length) {
    quest.puzzles[currentPuzzleIndex + 1].status =
      QuestPuzzleStatus.AWAITING_ACTIVATION;
    quest.puzzles[currentPuzzleIndex + 1].startTime = currentTime;
  } else {
    quest.status = QuestStatus.COMPLETED;
  }
  await quest.save();
  return { status: "success" };
}

export async function getPuzzleHint(name) {
  const quest = await getQuestData(name);
  if (quest === null) {
    return { error: `No quest with name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return { error: `Quest ${name} is not yet started` };
  }

  // NOTE: This could lead to the hint index continuing to increase
  // beyond the number of hints for the puzzle. This is to avoid a
  // lookup of the puzzle from the Puzzles schema. Consumers of this
  // service will have to take that into account when managing the
  // implications of requesting hints.
  const currentPuzzleIndex = getCurrentPuzzleIndex(quest);
  const currentPuzzleStatus = quest.puzzles[currentPuzzleIndex].status;
  if (currentPuzzleStatus !== QuestPuzzleStatus.IN_PROGRESS) {
    return {
      error: `Current puzzle (index: ${currentPuzzleIndex}) is not active (puzzle status: ${currentPuzzleStatus})`,
    };
  }
  quest.puzzles[currentPuzzleIndex].nextHintToDisplay += 1;
  quest.save();
  return { status: "success" };
}
