import { DataGrid } from "./components/grid.js";
import { callApi, listAll } from "./api.js";

const LIST_ERROR = "The list could not be loaded. Please try again.";

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  const errorDisplay = errorNotifier.querySelector("span");
  errorDisplay.innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

document.querySelector("#users").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const users = await listAll("/users");
  if (users.ok) {
    const fieldDefinitions = [
      {
        fieldName: "userName",
        title: "User Name",
        width: "25%",
        type: "link",
        linkTemplate: "/user/:userName",
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%",
      },
    ];
    const grid = new DataGrid("Users", fieldDefinitions);
    grid.render(users.items);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/user/register";
    };
    // TODO: Wire up user deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  } else {
    showError(LIST_ERROR);
  }
});

document.querySelector("#puzzles").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const puzzles = await listAll("/puzzles");
  if (puzzles.ok) {
    const fieldDefinitions = [
      {
        fieldName: "name",
        title: "Puzzle Name",
        width: "25%",
        type: "link",
        linkTemplate: "/puzzle/:name",
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%",
      },
    ];
    const grid = new DataGrid("Puzzles", fieldDefinitions);
    grid.render(puzzles.items);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/puzzle/new";
    };
    // TODO: Wire up puzzle deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  } else {
    showError(LIST_ERROR);
  }
});

document.querySelector("#quests").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const quests = await listAll("/quests");
  if (quests.ok) {
    const fieldDefinitions = [
      {
        fieldName: "name",
        title: "Quest Name",
        type: "link",
        linkTemplate: "/quest/:name",
      },
      {
        fieldName: "displayName",
        title: "Display Name",
      },
      {
        fieldName: "assignedTo",
        title: "Assigned To",
      },
      {
        fieldName: "statusDescription",
        title: "Status",
      },
    ];
    const grid = new DataGrid("Quests", fieldDefinitions);
    grid.render(
      quests.items.map((quest) => ({
        ...quest,
        assignedTo: `${quest.assignee.name ?? "(deleted)"} (${quest.assignee.kind})`,
      }))
    );
    grid.onAddDataRequested = (e) => {
      window.location.href = "/quest/new";
    };
    // TODO: Wire up quest deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  } else {
    showError(LIST_ERROR);
  }
});

document.querySelector("#teams").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const teams = await listAll("/teams");
  if (teams.ok) {
    const fieldDefinitions = [
      {
        fieldName: "teamName",
        title: "Team Name",
        editable: true,
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        editable: true,
      },
      {
        fieldName: "joinCode",
        title: "Join Code",
        editable: true,
      },
    ];
    const grid = new DataGrid("Teams", fieldDefinitions, {
      allowRowEditing: true,
    });
    grid.render(teams.items);
    grid.onAddDataRequested = (e) => {
      grid.addDataRow({
        teamName: "",
        displayName: "",
        joinCode: "",
      });
      grid.editDataRow(grid.getData().length - 1);
    };
    grid.onRowEditRequested = (e) => {
      const gridRow = e.currentTarget.parentNode.parentNode;
      const index = gridRow.rowIndex - 1;
      grid.editDataRow(index);
      gridRow.querySelector("td[data-field-name='teamName'] input").readOnly =
        true;
      gridRow.setAttribute("data-edit-mode", "update");
    };
    grid.onRowEditCommit = async (e) => {
      const gridRow = e.currentTarget.parentNode.parentNode;
      const index = gridRow.rowIndex - 1;
      const isUpdate = gridRow.hasAttribute("data-edit-mode");
      if (isUpdate) {
        gridRow.removeAttribute("data-edit-mode");
      }
      const dataItem = grid.getData()[index];
      const teamData = {
        displayName: dataItem.displayName,
        joinCode: dataItem.joinCode,
      };
      const response = isUpdate
        ? await callApi(`/teams/${encodeURIComponent(dataItem.teamName)}`, {
            method: "PATCH",
            body: teamData,
          })
        : await callApi("/teams", {
            method: "POST",
            body: { ...teamData, teamName: dataItem.teamName },
          });
      if (!response.ok) {
        showError(response.problem.detail ?? response.problem.title);
      }
    };
    // TODO: Wire up quest deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  } else {
    showError(LIST_ERROR);
  }
});
