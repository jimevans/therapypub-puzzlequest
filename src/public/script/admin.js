import { DataGrid } from "./components/grid.js";

async function getData(element) {
  const apiEndpoint = element.getAttribute("data-api-endpoint");
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
  const userData = await getData(e.currentTarget);
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
    grid.initialize("Users", "/user/register", fieldDefinitions, userData.users);
    // TODO: Wire up user deletion
    // grid.onDeleteRequested = (itemUrl) => console.log(itemUrl);
    gridElement.replaceChildren(grid.getElement());
    gridElement.classList.remove("pq-hide");
  }
});
