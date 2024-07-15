import { DataGrid } from "./components/grid.js";
import { Lookup } from "./components/lookup.js";

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

async function callDataApi(apiEndPoint, method, data) {
  try {
    const response = await fetch(apiEndPoint, {
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
      return responseData;
    }
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}

const puzzleGridOptions = {
  allowCreation: true,
  allowRowDeleting: true,
  allowRowEditing: false,
  allowRowReordering: true,
  allowRowSelecting: false
}

const columnDefinitions = [
  {
    fieldName: "name",
    title: "Puzzle Name",
  },
  {
    fieldName: "displayName",
    title: "Display Name"
  },
  {
    fieldName: "solutionDisplayText",
    title: "Solution"
  },
  {
    fieldName: "nextHintToDisplay",
    title: "Next Hint Number"
  },
  {
    fieldName: "activationCode",
    title: "Activation Code"
  }
];
const puzzleGrid = new DataGrid("Quest Puzzles", columnDefinitions, puzzleGridOptions);
puzzleGrid.setAddNewDataLinkText("Add puzzle to quest");
puzzleGrid.render(quest ? quest.puzzles : []);

puzzleGrid.onAddDataRequested = () => {
   const lookupColumnDefinitions = [
    {
      fieldName: "name",
      title: "Puzzle name"
    },
    {
      fieldName: "displayName",
      title: "Display name"
    },
    {
      fieldName: "solutionDisplayText",
      title: "Solution text"
    }
  ];
  const puzzleLookup = new Lookup("Select puzzles", lookupColumnDefinitions, true);
  puzzleLookup.onConfirmButtonClick = (e) => {
    const selectedPuzzles = puzzleLookup.getSelectedData();
    puzzleLookup.hide();
    selectedPuzzles.forEach((puzzle) => {
      const questPuzzle = {
        name: puzzle.name,
        displayName: puzzle.displayName,
        solutionDisplayText: puzzle.solutionDisplayText,
        nextHintToDisplay: 0,
        status: 0
      }
      puzzleGrid.addDataRow(questPuzzle, columnDefinitions);
    });
  }

  puzzleLookup.render("/api/puzzle/list", "data");
  puzzleLookup.show();
}

puzzleGrid.onDeleteDataRequested = (e) => {
  puzzleGrid.deleteDataRow(e.currentTarget.parentNode.parentNode.rowIndex - 1);
};

document.querySelector("#set-user-button").addEventListener("click", (e) => {
  e.stopPropagation();
   const lookupColumnDefinitions = [
    {
      fieldName: "userName",
      title: "User name"
    },
    {
      fieldName: "displayName",
      title: "Display name"
    }
  ];
  const userLookup = new Lookup("Select user", lookupColumnDefinitions);
  userLookup.onConfirmButtonClick = (e) => {
    const selectedUser = userLookup.getSelectedData();
    userLookup.hide();
    if (selectedUser.length > 0) {
      document.querySelector("#user-name").value = selectedUser[0].userName;
    }
  }
  userLookup.render("/api/user/list", "data");
  userLookup.show();
});

document.querySelector("#set-team-button").addEventListener("click", (e) => {
  e.stopPropagation();
   const lookupColumnDefinitions = [
    {
      fieldName: "teamName",
      title: "Team name"
    },
    {
      fieldName: "displayName",
      title: "Display name"
    }
  ];
  const userLookup = new Lookup("Select team", lookupColumnDefinitions);
  userLookup.onConfirmButtonClick = (e) => {
    const selectedTeam = userLookup.getSelectedData();
    userLookup.hide();
    if (selectedTeam.length > 0) {
      document.querySelector("#user-name").value = selectedTeam[0].teamName;
    }
  }
  userLookup.render("/api/team/list", "data");
  userLookup.show();
});

document.querySelector("#quest-puzzles").replaceChildren(puzzleGrid.getElement());

document.querySelector("#cancel").addEventListener("click", (e) => {
  e.preventDefault();
  if (quest) {
    window.location.href = `/quest/${quest.name}`;
  } else {
    window.location.href = "/";
  }
});


function getQuestData() {
  let puzzleIndex = 0;
  const questPuzzles = [];
  puzzleGrid.getData().forEach(questPuzzle => {
    questPuzzles.push({
      puzzleName: questPuzzle.name,
      nextHintToDisplay: questPuzzle.nextHintToDisplay,
      status: questPuzzle.status,
      activationCode: questPuzzle.activationCode
    });
    puzzleIndex++;
  })
  const questName =
    renderMode === "create"
      ? document.querySelector("#quest-name").value
      : quest.name;
  const questData = {
    name: questName,
    displayName: document.querySelector("#display-name").value,
    userName: document.querySelector("#user-name").value,
    status: parseInt(document.querySelector("#quest-status").value),
    puzzles: questPuzzles
  };
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
  if (questData.userName === "") {
    dataErrors.push("solution keyword cannot be empty");
  }
  return dataErrors;
}

document.querySelector("#save").addEventListener("click", async (e) => {
  e.preventDefault();
  clearError();
  const questData = getQuestData();
  const dataErrors = validateInput(questData, renderMode);
  if (dataErrors.length) {
    showError(dataErrors.join(", "));
    return;
  }

  const dataApiVerb = renderMode === "edit" ? "put" : "post";
  const dataApiUrl =
    renderMode === "edit"
      ? `/api/quest/${questData.name}`
      : `/api/quest/create`;

  const dataReturn = await callDataApi(dataApiUrl, dataApiVerb, questData);
  if (dataReturn.status === "error") {
    showError(dataReturn.message);
    return;
  }
  window.location.href = `/quest/${questData.name}`;
});
