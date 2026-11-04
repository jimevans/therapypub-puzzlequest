/* global renderMode, user -- defined by an inline script in the page */
import { DataGrid } from "./components/grid.js";
import { Lookup } from "./components/lookup.js";
import { callApi, listAll } from "./api.js";
import "./emailReminder.js";

const MINIMUM_PASSWORD_LENGTH = 8;

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  const errorDisplay = errorNotifier.querySelector("span");
  errorDisplay.innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

/**
 * Gets the API path of the user's membership of a team.
 * @param {string} teamName the team
 * @returns {string} the path
 */
function membershipPath(teamName) {
  return `/teams/${encodeURIComponent(teamName)}/members/${encodeURIComponent(user.name)}`;
}

function createAdditionalLookupBody() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("pq-form-element");

  const labelDiv = document.createElement("div");
  labelDiv.classList.add("pq-label");
  const label = document.createElement("label");
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
  } else if (
    userData.password !== undefined &&
    userData.password.length < MINIMUM_PASSWORD_LENGTH
  ) {
    dataErrors.push(
      `password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`
    );
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
    sms: document.querySelector("#allow-sms").checked,
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
  const response =
    renderMode === "create"
      ? await callApi("/users", { method: "POST", body: userData })
      : await callApi(`/users/${encodeURIComponent(user.name)}`, {
          method: "PATCH",
          body: userData,
        });
  if (!response.ok) {
    showError(response.problem.detail ?? response.problem.title);
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
  document
    .querySelector("#save-button")
    .addEventListener("click", async (e) => {
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
    allowCreation: true,
    allowRowDeleting: true,
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
    const leaveResponse = await callApi(membershipPath(teamName), {
      method: "DELETE",
    });
    if (!leaveResponse.ok) {
      showError(leaveResponse.problem.detail ?? leaveResponse.problem.title);
      return;
    }
    teamsGrid.deleteDataRow(itemIndex);
  };
  teamsGrid.onAddDataRequested = async (e) => {
    e.preventDefault();
    const lookupGridColumnDefs = [
      {
        fieldName: "teamName",
        title: "Team ID",
      },
      {
        fieldName: "displayName",
        title: "Team Name",
      },
    ];

    const teamLookup = new Lookup("Select Team", lookupGridColumnDefs, false);
    const teams = await listAll("/teams");
    if (!teams.ok) {
      showError(teams.problem.detail ?? teams.problem.title);
      return;
    }
    teamLookup.renderItems(teams.items);
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
      const joinCode = teamLookup
        .getAdditionalBodyElement()
        .querySelector("#join-code").value;
      if (!joinCode) {
        showError("No join code entered");
        return;
      }
      const joinResponse = await callApi(membershipPath(teamName), {
        method: "PUT",
        body: { joinCode },
      });
      if (!joinResponse.ok) {
        showError(joinResponse.problem.detail ?? joinResponse.problem.title);
        return;
      }
      teamsGrid.addDataRow({
        teamName,
        displayName: teamLookup.getSelectedData()[0].displayName,
      });
    };
    teamLookup.show();
  };
  if (user) {
    teamsGrid.render(user.teams);
  }
  document.querySelector("#teams").replaceChildren(teamsGrid.getElement());
}

const changePasswordButton = document.querySelector("#change-password-button");
if (changePasswordButton) {
  const passwordError = document.querySelector("#change-password-error");
  const passwordSuccess = document.querySelector("#change-password-success");
  const showPasswordError = (message) => {
    passwordError.querySelector("span").innerText = message;
    passwordError.classList.remove("pq-hide");
  };

  changePasswordButton.addEventListener("click", async (e) => {
    e.preventDefault();
    passwordError.classList.add("pq-hide");
    passwordSuccess.classList.add("pq-hide");
    const currentPasswordElement = document.querySelector("#current-password");
    const newPasswordElement = document.querySelector("#new-password");
    const confirmPasswordElement = document.querySelector(
      "#new-password-confirm"
    );
    if (!currentPasswordElement.value) {
      showPasswordError("Enter your current password");
      return;
    }
    if (newPasswordElement.value.length < MINIMUM_PASSWORD_LENGTH) {
      showPasswordError(
        `New password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`
      );
      return;
    }
    if (newPasswordElement.value !== confirmPasswordElement.value) {
      showPasswordError("New password and confirm password do not match");
      return;
    }
    const response = await callApi(
      `/users/${encodeURIComponent(user.name)}/password`,
      {
        method: "PUT",
        body: {
          currentPassword: currentPasswordElement.value,
          newPassword: newPasswordElement.value,
        },
      }
    );
    if (!response.ok) {
      showPasswordError(response.problem.detail ?? response.problem.title);
      return;
    }
    currentPasswordElement.value = "";
    newPasswordElement.value = "";
    confirmPasswordElement.value = "";
    passwordSuccess.classList.remove("pq-hide");
  });
}

const sendResetLinkButton = document.querySelector("#send-reset-link-button");
if (sendResetLinkButton) {
  const resetLinkError = document.querySelector("#send-reset-link-error");
  const resetLinkSuccess = document.querySelector("#send-reset-link-success");

  sendResetLinkButton.addEventListener("click", async (e) => {
    e.preventDefault();
    resetLinkError.classList.add("pq-hide");
    resetLinkSuccess.classList.add("pq-hide");
    sendResetLinkButton.disabled = true;
    const response = await callApi(
      `/users/${encodeURIComponent(user.name)}/password-reset-links`,
      { method: "POST" }
    );
    sendResetLinkButton.disabled = false;
    if (!response.ok) {
      resetLinkError.querySelector("span").innerText =
        response.problem.detail ?? response.problem.title;
      resetLinkError.classList.remove("pq-hide");
      return;
    }
    resetLinkSuccess.classList.remove("pq-hide");
  });
}
