import { DataGrid } from "./components/grid.js";
import { Lookup } from "./components/lookup.js";
import { Modal } from "./components/modal.js";

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
      if ("error" in responseData) {
        console.log(
          `${response.status} received with error ${responseData.error}`
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
        linkTemplate: "/user/:userName"
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%"
      },
    ];
    const grid = new DataGrid();
    grid.initialize("Users", fieldDefinitions, userData.users);
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
        linkTemplate: "/puzzle/:name"
      },
      {
        fieldName: "displayName",
        title: "Display Name",
        width: "25%"
      },
    ];
    const grid = new DataGrid();
    grid.initialize("Puzzles", fieldDefinitions, puzzleData.puzzles);
    grid.onAddDataRequested = (e) => {
      window.location.href = "/puzzle/new";
    };
    // TODO: Wire up user deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});

const modal = new Lookup();
modal.setTitle("Test modal");
modal.setConfirmButtonText("Hit me");

document.querySelector("#show-modal").addEventListener("click", async (e) => {
  const fieldDefinitions = [
    {
      fieldName: "name",
      title: "Puzzle Name",
      width: "25%",
    },
    {
      fieldName: "displayName",
      title: "Display Name",
      width: "25%"
    },
  ];
  await modal.initialize("Select puzzles", "/api/puzzle/list", "puzzles", fieldDefinitions);
  modal.onConfirmButtonClick = (e) => {
    const selectedPuzzles = modal.getSelectedData();
    console.log(JSON.stringify(selectedPuzzles));
  }
  modal.show();
});
