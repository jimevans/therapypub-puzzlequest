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
  const userData = await getData(e.currentTarget);
  if (userData && userData.status === "success") {
    document.querySelector("#dataCollectionName").textContent = "Users";
    const dataDisplayElement = document.querySelector("#dataDisplay");
    const userElements = [];
    userData.users.forEach((userInfo) => {
      const userDiv = document.createElement("div");
      userDiv.textContent = userInfo.userName;
      userElements.push(userDiv);
    });
    dataDisplayElement.replaceChildren(...userElements);
  }
});
