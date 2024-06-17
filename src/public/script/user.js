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
      body: JSON.stringify(data)
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

if (renderMode === "display") {
  document.querySelector("#edit").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/user/${userName}/edit`;
  });
} else if (renderMode === "edit") {
  document.querySelector("#save").addEventListener("click", async (e) => {
    e.preventDefault();
    const userData = {
      userName: document.querySelector("#user-name").value,
      displayName: document.querySelector("#display-name").value,
      email: document.querySelector("#email").value,
      sms: document.querySelector("#sms").value,
    };
    const authLevelElement = document.querySelector("#auth-level");
    if (authLevelElement) {
      userData.authorizationLevel = authLevelElement.value;
    }
    const dataErrors = validateInput(userData, renderMode);
    if (dataErrors.length) {
      showError(dataErrors.join(", "));
      return;
    }
    const dataReturn = await callDataApi(`/api/user/${userData.userName}`, "put", userData);
    if ("error" in dataReturn) {
      showError(dataReturn.error);
      return;
    }
    window.location.href = "/";
  });
  document.querySelector("#cancel").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/user/${userName}`;
  });
} else if (renderMode === "create") {
  document.querySelector("#save").addEventListener("click", async (e) => {
    e.preventDefault();
    const userData = {
      userName: document.querySelector("#user-name").value,
      displayName: document.querySelector("#display-name").value,
      password: document.querySelector("#password").value,
      email: document.querySelector("#email").value,
      sms: document.querySelector("#sms").value,
    };
    const dataErrors = validateInput(userData, renderMode);
    if (dataErrors.length) {
      showError(dataErrors.join(", "));
      return;
    }
    const dataReturn = await callDataApi("/api/user/create", "post", userData);
    if ("error" in dataReturn) {
      showError(dataReturn.error);
      return;
    }
    window.location.href = "/";
  });
  document.querySelector("#cancel").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/";
  });
}
