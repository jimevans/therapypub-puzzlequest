import { DataGrid } from "./components/grid.js";

async function getData(apiEndpoint) {
  try {
    const response = await fetch(apiEndpoint, {
      method: "get",
      headers: {
        "Content-Type": "application/json",
      },
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
    }
  } catch (err) {
    console.log("error: " + err);
  }
}

document.querySelector("#users").addEventListener("click", async (e) => {
  e.preventDefault();
  const gridElement = document.querySelector("#data-grid");
  gridElement.classList.add("pq-hide");
  const userData = await getData(e.currentTarget.getAttribute("data-api-endpoint"));
  if (userData && userData.status === "success") {
    const fieldDefinitions = [
      {
        fieldName: "userName",
        title: "User Name",
        width: "25%",
        type: "link",
        linkTemplate: "/user/:userName"
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%"
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
  const puzzleData = await getData(e.currentTarget.getAttribute("data-api-endpoint"));
  if (puzzleData && puzzleData.status === "success") {
    const fieldDefinitions = [
      {
        fieldName: "name",
        title: "Puzzle Name",
        width: "25%",
        type: "link",
        linkTemplate: "/puzzle/:name"
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%"
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
  const questData = await getData(e.currentTarget.getAttribute("data-api-endpoint"));
  if (questData && questData.status === "success") {
    const fieldDefinitions = [
      {
        fieldName: "name",
        title: "Quest Name",
        type: "link",
        linkTemplate: "/quest/:name"
      },
      {
        fieldName: "displayName",
        title: "Display Name"
      },
      {
        fieldName: "userName",
        title: "User Name"
      },
      {
        fieldName: "statusDescription",
        title: "Status"
      }
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
