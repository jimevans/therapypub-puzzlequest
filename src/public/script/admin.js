import { DataGrid } from "./components/grid.js";

function showError(errorMessage) {
  const errorNotifier = document.querySelector(".pq-error");
  const errorDisplay = errorNotifier.querySelector("span");
  errorDisplay.innerText = errorMessage;
  errorNotifier.classList.remove("pq-hide");
}

async function callDataApi(apiEndpoint, method = "get", body = {}) {
  const fetchArgs = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "get") {
    fetchArgs.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(apiEndpoint, fetchArgs);
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
    }
  } catch (err) {
    console.log("error: " + err);
  }
}

document.querySelector("#users").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const userData = await callDataApi(
    e.currentTarget.getAttribute("data-api-endpoint")
  );
  if (userData && userData.status === "success") {
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
    grid.render(userData.data);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/user/register";
    };
    // TODO: Wire up user deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});

document.querySelector("#puzzles").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const puzzleData = await callDataApi(
    e.currentTarget.getAttribute("data-api-endpoint")
  );
  if (puzzleData && puzzleData.status === "success") {
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
    grid.render(puzzleData.data);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/puzzle/new";
    };
    // TODO: Wire up puzzle deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});

document.querySelector("#quests").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const questData = await callDataApi(
    e.currentTarget.getAttribute("data-api-endpoint")
  );
  if (questData && questData.status === "success") {
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
        fieldName: "userName",
        title: "User Name",
      },
      {
        fieldName: "statusDescription",
        title: "Status",
      },
    ];
    const grid = new DataGrid("Quests", fieldDefinitions);
    grid.render(questData.data);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/quest/new";
    };
    // TODO: Wire up quest deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});

document.querySelector("#teams").addEventListener("click", async (e) => {
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const teamData = await callDataApi(
    e.currentTarget.getAttribute("data-api-endpoint")
  );
  if (teamData && teamData.status === "success") {
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
    grid.render(teamData.data);
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
      gridRow.querySelector("td[data-field-name='teamName'] input").readOnly = true;
      gridRow.setAttribute("data-edit-mode", "update");
    }
    grid.onRowEditCommit = async (e) => {
      const gridRow = e.currentTarget.parentNode.parentNode;
      const index = gridRow.rowIndex - 1;
      const isUpdate = gridRow.hasAttribute("data-edit-mode");
      if (isUpdate) {
        gridRow.removeAttribute("data-edit-mode");
      }
      const dataItem = grid.getData()[index];
      const updateApi = isUpdate ? `/api/team/${dataItem.teamName}` : "/api/team/create";
      const method = isUpdate ? "put" : "post";
      const teamData = {
        displayName: dataItem.displayName,
        joinCode: dataItem.joinCode,
      };
      if (!isUpdate) {
        teamData.teamName = dataItem.teamName;
      }
      const updateResponse = await callDataApi(updateApi, method, teamData);
      if (updateResponse.status === "error") {
        showError(updateResponse.message);
      }
    };
    // TODO: Wire up quest deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});
