function authorizationLevelToString(authLevel) {
  if (authLevel >= 10) {
    return "Administrator";
  } else if (authLevel > 0) {
    return "Registered User";
  }
  return "Guest";
}

async function getUserData(userName) {
  try {
    const response = await fetch(`/api/user/${userName}`, {
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

async function populateUser(userName) {
  if (userName !== "") {
    const userData = await getUserData(userName);
    if (userData && userData.status === "success") {
      document.querySelector("#user-name input").value = userData.user.userName;
      document.querySelector("#display-name input").value =
        userData.user.displayName;
      document.querySelector("#email input").value = userData.user.email;
      document.querySelector("#sms input").value = userData.user.sms;
      if ("authorizationLevel" in userData.user) {
        const authLevelElement = document.querySelector("#auth-level");
        authLevelElement.querySelector("input").value =
          userData.user.authorizationLevelDescription;
        authLevelElement.classList.remove("pq-hide");
      }
    }
  }
}
