import {
  QuestModel as Quest,
  QuestStatus,
  QuestPuzzleStatus,
} from "../models/quest.model.js";
import * as PuzzleService from "./puzzle.service.js";
import * as UserService from "./user.service.js";

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
    foundQuest.name =
      questDefinition.name ||
      questDefinition.displayName.replace(" ", ".").toLowerCase();
    foundQuest.displayName =
      questDefinition.displayName || questDefinition.name;
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
    const validUsers = userNameResponse.identifiers.map(
      (identifier) => identifier.name
    );
    questFilter.userName = { $in: validUsers };
  }
  const foundQuests = await Quest.find(questFilter);
  return { status: "success", quests: foundQuests };
}

export async function isQuestForUser(quest, userName) {
  const userNameResponse = await UserService.getUserAndTeams(userName);
  if ("error" in userNameResponse) {
    return userNameResponse;
  }
  const userAndTeams = userNameResponse.identifiers.map(
    (identifier) => identifier.name
  );
  return {
    status: "success",
    isQuestForUser: userAndTeams.includes(quest.userName),
  };
}

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
    return { error: `no quest with name ${name}` };
  }
  // We should only ever have one here, so take the 0th one.
  return { status: "success", quest: foundQuests[0] };
}

export async function getQuestData(name, omitUnavailablePuzzles = false) {
  const queryResponse = await queryForQuest(name);
  if ("error" in queryResponse) {
    return { status: "success", quest: null };
  }

  const foundQuest = queryResponse.quest;
  const questData = {
    name: foundQuest.name,
    displayName: foundQuest.displayName,
    userName: foundQuest.userName,
    status: foundQuest.status,
    puzzles: [],
  };
  const foundPuzzles = foundQuest.puzzles
    .filter((puzzle) => {
      if (
        !omitUnavailablePuzzles ||
        (omitUnavailablePuzzles &&
          puzzle.status >= QuestPuzzleStatus.AWAITING_ACTIVATION)
      ) {
        return puzzle;
      }
    })
    .sort((a, b) => a.questOrder - b.questOrder);
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
    const hints = detail.hints
      .filter((hint) => hint.order < puzzle.nextHintToDisplay)
      .sort((first, second) => first.order - second.order);
    const nextHintCandidate = detail.hints.filter(
      (hint) => hint.order === puzzle.nextHintToDisplay
    );
    const nextHintTimePenalty = nextHintCandidate.length
      ? nextHintCandidate[0].timePenalty
      : 0;
    const isNextHintSolution = nextHintCandidate.length
      ? nextHintCandidate[0].solutionWarning
      : undefined;
    questData.puzzles.push({
      name: puzzle.puzzleName,
      displayName: detail.displayName,
      type: detail.type,
      text: detail.text,
      solutionDisplayText: detail.solutionDisplayText,
      questOrder: puzzle.questOrder,
      hints: hints,
      nextHintToDisplay: puzzle.nextHintToDisplay,
      nextHintTimePenalty: nextHintTimePenalty,
      nextHintSolutionWarning: isNextHintSolution,
      status: puzzle.status,
      statusDescription: statusDescription,
      startTime: puzzle.startTime,
      endTime: puzzle.endTime,
      activationTime: puzzle.activationTime,
      activationCode: detail.activationCode,
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
  const foundQuest = await Quest.findOne({ name: name });
  if (foundQuest === null) {
    return { error: `No quest with quest name ${name} found` };
  }

  if (foundQuest.status !== QuestStatus.NOT_STARTED) {
    return {
      error: `Quest ${name} cannot be started; status is ${foundQuest.status}`,
    };
  }

  if (foundQuest.puzzles.length === 0) {
    return {
      error: `Quest ${name} cannot be started; it has no puzzles`,
    };
  }

  foundQuest.status = QuestStatus.IN_PROGRESS;
  foundQuest.puzzles[0].status = QuestPuzzleStatus.AWAITING_ACTIVATION;
  foundQuest.puzzles[0].startTime = new Date(Date.now());
  await foundQuest.save();
  return { status: "success" };
}

export async function activateCurrentPuzzle(name, activationCode) {
  const quest = await Quest.findOne({ name: name });
  if (quest === null) {
    return { error: `No quest with quest name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return { error: `Quest ${name} is not yet started` };
  }

  const pendingPuzzles = quest.puzzles.filter(
    (puzzle) => puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION
  );

  if (!pendingPuzzles.length) {
    return { error: `No puzzles pending activation for quest ${name}` };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = pendingPuzzles[0];
  const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(
    currentPuzzle.puzzleName
  );
  if ("error" in puzzleResult) {
    return puzzleResult;
  }
  const foundPuzzle = puzzleResult.puzzle;
  if (foundPuzzle.activationCode !== activationCode) {
    return { error: "Incorrect activation code for puzzle" };
  }

  currentPuzzle.activationTime = new Date(Date.now());
  currentPuzzle.status = QuestPuzzleStatus.IN_PROGRESS;
  await quest.save();
  return { status: "success" };
}

export async function finishCurrentPuzzle(name, solutionGuess) {
  const quest = await Quest.findOne({ name: name });
  if (quest === null) {
    return { error: `No quest with quest name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return { error: `Quest ${name} is not yet started` };
  }

  const inProgressPuzzles = quest.puzzles.filter(
    (puzzle) => puzzle.status === QuestPuzzleStatus.IN_PROGRESS
  );

  if (!inProgressPuzzles.length) {
    return { error: `No puzzles pending activation for quest ${name}` };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = inProgressPuzzles[0];
  const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(
    currentPuzzle.puzzleName
  );
  if ("error" in puzzleResult) {
    return puzzleResult;
  }
  const foundPuzzle = puzzleResult.puzzle;
  const solutionKeywords = foundPuzzle.solutionKeyword.split(",");
  const foundKeywords = solutionKeywords.filter((keyword) =>
    RegExp(keyword, "i").test(solutionGuess)
  );
  if (foundKeywords.length !== solutionKeywords.length) {
    return { error: "Incorrect guess for puzzle solution" };
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
  await quest.save();
  return { status: "success", solutionText: foundPuzzle.solutionDisplayText };
}

export async function getPuzzleHint(name) {
  const quest = await Quest.findOne({ name: name });
  if (quest === null) {
    return { error: `No quest with quest name ${name} found` };
  }

  if (quest.status >= QuestStatus.COMPLETED) {
    return { error: `Quest ${name} is already completed` };
  } else if (quest.status < QuestStatus.NOT_STARTED) {
    return { error: `Quest ${name} is not yet started` };
  }

  const inProgressPuzzles = quest.puzzles.filter(
    (puzzle) => puzzle.status === QuestPuzzleStatus.IN_PROGRESS
  );

  if (!inProgressPuzzles.length) {
    return { error: `No puzzle in progress for quest ${name}` };
  }

  // Should only ever be one puzzle pending activation, so get the first one.
  const currentPuzzle = inProgressPuzzles[0];
  const puzzleResult = await PuzzleService.getPuzzleByPuzzleName(
    currentPuzzle.puzzleName
  );
  if ("error" in puzzleResult) {
    return puzzleResult;
  }
  const foundPuzzle = puzzleResult.puzzle;
  if (currentPuzzle.nextHintToDisplay >= foundPuzzle.hints.length) {
    return { status: "success", moreHints: false };
  }
  const sortedHints = foundPuzzle.hints.toSorted(
    (first, second) => first.order - second.order
  );
  const nextHint = sortedHints[currentPuzzle.nextHintToDisplay];
  currentPuzzle.nextHintToDisplay += 1;
  const solutionWarning =
    currentPuzzle.nextHintToDisplay >= foundPuzzle.hints.length
      ? false
      : sortedHints[currentPuzzle.nextHintToDisplay].solutionWarning;
  await quest.save();
  return {
    status: "success",
    hintText: nextHint.text,
    moreHints: currentPuzzle.nextHintToDisplay < foundPuzzle.hints.length,
    timePenalty: nextHint.timePenalty,
    isNextHintSolution: solutionWarning
  };
}
