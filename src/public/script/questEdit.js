/* global renderMode, quest -- defined by an inline script in the page */
import { DataGrid } from "./components/grid.js";
import { Lookup } from "./components/lookup.js";
import { listAll } from "./api.js";
import { callDataApi } from "./fetch.js";

function clearError() {
  const errorNotifier = document.querySelector(".pq-error");
  const errorMessage = errorNotifier.querySelector("span");
  errorNotifier.classList.add("pq-hide");
  errorMessage.innerText = "";
}

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  const errorDisplay = errorNotifier.querySelector("span");
  errorDisplay.innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

/**
 * Fills a lookup with every item of a v1 list.
 * @param {Lookup} lookup the lookup
 * @param {string} path the list's path below /api/v1
 */
async function renderLookup(lookup, path) {
  const list = await listAll(path);
  if (!list.ok) {
    showError(list.problem.detail ?? list.problem.title);
    return;
  }
  lookup.renderItems(list.items);
}

const puzzleGridOptions = {
  allowCreation: true,
  allowRowDeleting: true,
  allowRowEditing: false,
  allowRowReordering: true,
  allowRowSelecting: false,
};

const columnDefinitions = [
  {
    fieldName: "puzzleName",
    title: "Puzzle Name",
  },
  {
    fieldName: "displayName",
    title: "Display Name",
  },
  {
    fieldName: "solutionDisplayText",
    title: "Solution",
  },
  {
    fieldName: "nextHintToDisplay",
    title: "Next Hint Number",
  },
  {
    fieldName: "activationCode",
    title: "Activation Code",
    // A puzzle added in the editor gets its code when the quest is saved.
    placeholder: "Assigned when saved",
  },
];
const puzzleGrid = new DataGrid(
  "Quest Puzzles",
  columnDefinitions,
  puzzleGridOptions
);
puzzleGrid.setAddNewDataLinkText("Add puzzle to quest");
puzzleGrid.render(quest ? quest.puzzles : []);

puzzleGrid.onAddDataRequested = () => {
  const lookupColumnDefinitions = [
    {
      fieldName: "name",
      title: "Puzzle name",
    },
    {
      fieldName: "displayName",
      title: "Display name",
    },
    {
      fieldName: "solutionDisplayText",
      title: "Solution text",
    },
  ];
  const puzzleLookup = new Lookup(
    "Select puzzles",
    lookupColumnDefinitions,
    true
  );
  puzzleLookup.onConfirmButtonClick = (e) => {
    const selectedPuzzles = puzzleLookup.getSelectedData();
    puzzleLookup.hide();
    selectedPuzzles.forEach((puzzle) => {
      const questPuzzle = {
        puzzleName: puzzle.name,
        displayName: puzzle.displayName,
        solutionDisplayText: puzzle.solutionDisplayText,
        nextHintToDisplay: 0,
        status: 0,
      };
      puzzleGrid.addDataRow(questPuzzle, columnDefinitions);
    });
  };

  renderLookup(puzzleLookup, "/puzzles");
  puzzleLookup.show();
};

puzzleGrid.onDeleteDataRequested = (e) => {
  puzzleGrid.deleteDataRow(e.currentTarget.parentNode.parentNode.rowIndex - 1);
};

document.querySelector("#set-user-button").addEventListener("click", (e) => {
  e.stopPropagation();
  const lookupColumnDefinitions = [
    {
      fieldName: "userName",
      title: "User name",
    },
    {
      fieldName: "displayName",
      title: "Display name",
    },
  ];
  const userLookup = new Lookup("Select user", lookupColumnDefinitions);
  userLookup.onConfirmButtonClick = (e) => {
    const selectedUser = userLookup.getSelectedData();
    userLookup.hide();
    if (selectedUser.length > 0) {
      setAssignee("user", selectedUser[0].userName);
    }
  };
  renderLookup(userLookup, "/users");
  userLookup.show();
});

document.querySelector("#set-team-button").addEventListener("click", (e) => {
  e.stopPropagation();
  const lookupColumnDefinitions = [
    {
      fieldName: "teamName",
      title: "Team name",
    },
    {
      fieldName: "displayName",
      title: "Display name",
    },
  ];
  const userLookup = new Lookup("Select team", lookupColumnDefinitions);
  userLookup.onConfirmButtonClick = (e) => {
    const selectedTeam = userLookup.getSelectedData();
    userLookup.hide();
    if (selectedTeam.length > 0) {
      setAssignee("team", selectedTeam[0].teamName);
    }
  };
  renderLookup(userLookup, "/teams");
  userLookup.show();
});

/**
 * Shows the user or team chosen to assign the quest to.
 * @param {"user" | "team"} kind whether it is a user or a team
 * @param {string} name the user name or team name
 */
function setAssignee(kind, name) {
  const input = document.querySelector("#user-name");
  input.value = name;
  input.dataset.kind = kind;
  document.querySelector("#assignee-kind").textContent = `(${kind})`;
}

document
  .querySelector("#quest-puzzles")
  .replaceChildren(puzzleGrid.getElement());

function getQuestData() {
  // Progress isn't sent: it changes only through the game's actions.
  const questPuzzles = puzzleGrid.getData().map((questPuzzle) => {
    return {
      puzzleName: questPuzzle.puzzleName,
      activationCode: questPuzzle.activationCode,
    };
  });
  const questName =
    renderMode === "create"
      ? document.querySelector("#quest-name").value
      : quest.name;
  const questData = {
    name: questName,
    displayName: document.querySelector("#display-name").value,
    puzzles: questPuzzles,
  };
  const assigneeInput = document.querySelector("#user-name");
  if (assigneeInput.value !== "") {
    questData.assignee = {
      kind: assigneeInput.dataset.kind,
      name: assigneeInput.value,
    };
  }
  return questData;
}

function validateInput(questData) {
  const dataErrors = [];
  if (questData.name === "") {
    dataErrors.push("quest name cannot be empty");
  }
  if (questData.displayName === "") {
    dataErrors.push("quest display name cannot be empty");
  }
  if (!questData.assignee) {
    dataErrors.push("the quest must be assigned to a user or team");
  }
  return dataErrors;
}

async function saveQuest() {
  clearError();
  const questData = getQuestData();
  const dataErrors = validateInput(questData, renderMode);
  if (dataErrors.length) {
    showError(dataErrors.join(", "));
    return false;
  }

  const dataApiVerb = renderMode === "edit" ? "put" : "post";
  const dataApiUrl =
    renderMode === "edit"
      ? `/api/quest/${questData.name}`
      : `/api/quest/create`;

  const dataReturn = await callDataApi(dataApiUrl, dataApiVerb, questData);
  if (dataReturn.status === "error") {
    showError(dataReturn.message);
    return false;
  }
  return true;
}

document.querySelector("#save-button").addEventListener("click", async (e) => {
  const returnUrl = e.currentTarget.href;
  e.preventDefault();
  if (await saveQuest()) {
    window.location.href = returnUrl;
  }
});

document.querySelector("#save-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (await saveQuest()) {
    window.location.href = e.target.href;
  }
});
