import { QuestModel as Quest } from "../models/quest.model.js";
import { QuestPuzzleModel as QuestPuzzle } from "../models/quest.model.js";
import { QuestStatus, QuestPuzzleStatus } from "../models/quest.model.js";

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

export async function getQuests(status = -1) {
  const statusFilter = {};
  if (status >= QuestStatus.NOT_STARTED) {
    statusFilter.status = status;
  }
  const quests = await Quest.find(statusFilter);
  return quests;
}

async function getQuestData(name, omitUnavailablePuzzles = false) {
  const matchCriteria = [
    { $match: { name: name } },
    { $unwind: "$puzzles" },
    { $sort: "puzzles.questOrder" },
  ];

  if (omitUnavailablePuzzles) {
    matchCriteria.push({
      $match: {
        "puzzles.status": { $gte: QuestPuzzleStatus.AWAITING_ACTIVATION },
      },
    });
  }
  const quest = await Quest.aggregate(matchCriteria);
  return quest;
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
  const questExists = (await Quest.find({ name: questName }).length) !== 0;
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
      const puzzle = new QuestPuzzle({
        puzzleName: puzzleDefinition.puzzleName,
        questOrder: puzzleCount,
        nextHintToDisplay: 0,
        status: QuestPuzzleStatus.UNAVAILABLE,
      });
      createQuest.puzzles.push(puzzle);
      puzzleCount++;
    });
  }
  await quest.save();
  return { status: "success" };
}

export async function addPuzzle(
  questName,
  puzzleDefinition,
  puzzlePosition = -1
) {
  const quest = await getQuestData(questName, true);
  if (quest === null) {
    return { error: `No quest with name ${questName} found` };
  }

  if (quest.status !== 0) {
    return { error: `Quest with name ${questName} has been started` };
  }

  // NOTE: This could lead to attempting to add a puzzle name that does
  // not exist. This is to avoid a lookup of the puzzle from the Puzzles
  // schema. Consumers of this service will have to take that into account
  // when managing the implications of creating puzzles in a quest.
  const puzzle = new QuestPuzzle({
    puzzleName: puzzleDefinition.puzzleName,
    questOrder: puzzleCount,
    nextHintToDisplay: 0,
    status: QuestPuzzleStatus.UNAVAILABLE,
  });

  if (puzzlePosition < 0 || puzzlePosition >= quest.puzzles.length) {
    quest.puzzles.push(puzzle);
  } else {
    quest.puzzles.splice(puzzlePosition, 0, puzzle);
  }
  let order = 0;
  quest.puzzles.forEach((questPuzzle) => {
    questPuzzle.questOrder = order;
    order++;
  });
  await quest.save();
  return { status: "success" };
}

export async function getQuest(name) {
  const quest = await getQuestData(name).lean();
  if (quest === null) {
    return { error: `No quest with name ${name} found` };
  }
  return { status: "success", quest: quest };
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
