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

function createAdditionalLookupBody() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("pq-form-element");

  const labelDiv = document.createElement("div");
  labelDiv.classList.add("pq-label");
  const label = document.createElement("label")
  label.htmlFor = "join-code";
  label.innerText = "Join code:";
  labelDiv.appendChild(label);

  const textBoxDiv = document.createElement("div");
  textBoxDiv.classList.add("pq-input");
  const input = document.createElement("input");
  input.id = "join-code";
  textBoxDiv.appendChild(input);

  wrapper.appendChild(labelDiv);
  wrapper.appendChild(textBoxDiv);
  return wrapper;
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
    console.log("error: " + err);
  }
}

function validateInput(userData, renderMode) {
  const dataErrors = [];
  if (renderMode === "create") {
    const confirmPassword = document.querySelector("#password-confirm").value;
    if (userData.password !== confirmPassword) {
      dataErrors.push("password and confirm password do not match");
    }
  }
  if (userData.userName === "") {
    dataErrors.push("user name cannot be empty");
  }
  if (userData.displayName === "") {
    dataErrors.push("display name cannot be empty");
  }
  if (userData.password === "") {
    dataErrors.push("password cannot be empty");
  }
  if (userData.email === "") {
    dataErrors.push("email address cannot be empty");
  }
  return dataErrors;
}

async function saveUser() {
  const userData = {
    displayName: document.querySelector("#display-name").value,
    email: document.querySelector("#email").value,
    phone: document.querySelector("#phone").value,
    sms: document.querySelector("#allow-sms").checked
  };
  const authLevelElement = document.querySelector("#auth-level");
  if (authLevelElement) {
    userData.authorizationLevel = authLevelElement.value;
  }
  if (renderMode === "create") {
    userData.userName = document.querySelector("#user-name").value;
    userData.password = document.querySelector("#password").value;
  }
  const dataErrors = validateInput(userData, renderMode);
  if (dataErrors.length) {
    showError(dataErrors.join(", "));
     return false;
  }
  const uri = renderMode === "create" ? `/api/user/create` : `/api/user/${user.name}`;
  const method = renderMode === "create" ? "post" : "put";
  const dataReturn = await callDataApi(
    uri,
    method,
    userData
  );
  if (dataReturn.status === "error") {
    showError(dataReturn.message);
    return false;
  }
  return true;
}


if (renderMode === "display") {
  document.querySelector("#allow-sms").addEventListener("click", (e) => {
    e.preventDefault();
  });
} else {
  document.querySelector("#save-link").addEventListener("click", async (e) => {
    e.preventDefault();
    if (await saveUser()) {
      window.location.href = e.target.href;
    }
  });
  document.querySelector("#save-button").addEventListener("click", async (e) => {
    const returnUrl = e.currentTarget.href;
    e.preventDefault();
    if (await saveUser()) {
      window.location.href = returnUrl;
    }
  });
}

document.querySelector("#more-info-link").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("#more-info").classList.remove("pq-hide");
});

if (renderMode !== "create") {
  const gridColumnDefinitions = [
    {
      fieldName: "displayName",
      title: "Team Name",
    },
  ];

  const gridOptions = {
    allowCreation: renderMode !== "display",
    allowRowDeleting: renderMode !== "display",
    allowRowEditing: false,
    allowRowReordering: false,
    allowRowSelecting: false,
  };

  const teamsGrid = new DataGrid("Teams", gridColumnDefinitions, gridOptions);
  teamsGrid.setAddNewDataLinkText("Join new team");
  teamsGrid.onDeleteDataRequested = async (e) => {
    e.preventDefault();
    const itemIndex = e.currentTarget.parentNode.parentNode.rowIndex - 1;
    const teamName = teamsGrid.getData()[itemIndex].teamName;
    const leaveResponse = await callDataApi(
      `/api/team/${teamName}/member/${user.name}`,
      "delete",
      {}
    );
    if (leaveResponse.status === "error") {
      showError(leaveResponse.message);
      return;
    }
    teamsGrid.deleteDataRow(itemIndex);
  };
  teamsGrid.onAddDataRequested = async (e) => {
    e.preventDefault();
    const lookupGridColumnDefs = [
      {
        fieldName: "teamName",
        title: "Team ID"
      },
      {
        fieldName: "displayName",
        title: "Team Name"
      }
    ];

    const teamLookup = new Lookup("Select Team", lookupGridColumnDefs, false);
    await teamLookup.render(`/api/team/list`, "data");
    teamLookup.setConfirmButtonText("Join team");
    teamLookup.setAdditionalBodyContent(createAdditionalLookupBody());
    teamLookup.onCancelButtonClick = (e) => {
      teamLookup.hide();
    };
    teamLookup.onConfirmButtonClick = async (e) => {
      teamLookup.hide();
      const selectedData = teamLookup.getSelectedData();
      if (!selectedData.length) {
        showError("No team selected");
        return;
      }
      const teamName = teamLookup.getSelectedData()[0].teamName;
      const joinCode = teamLookup.getAdditionalBodyElement().querySelector("#join-code").value;
      if (!joinCode) {
        showError("No join code entered");
        return;
      }
      const joinResponse = await callDataApi(
        `/api/team/${teamName}/member/${user.name}`,
        "put",
        {
          joinCode: joinCode
        }
      );
      if (joinResponse.status === "error") {
        showError(joinResponse.message);
        return;
      }
      teamsGrid.addDataRow({
        displayName: teamLookup.getSelectedData()[0].displayName
      });
    }
    teamLookup.show();
  };
  if (user) {
    teamsGrid.render(user.teams);
  }
  document.querySelector("#teams").replaceChildren(teamsGrid.getElement());
}
