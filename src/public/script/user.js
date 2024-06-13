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
  const userData = await getUserData(userName);
  if (userData && userData.status === "success") {
    document.querySelector("#userName").innerText = userData.user.userName;
    document.querySelector("#displayName").innerText =
      userData.user.displayName;
    document.querySelector("#email").innerText = userData.user.email;
    document.querySelector("#sms").innerText = userData.user.sms;
    if ("authorizationLevel" in userData.user) {
      document.querySelector("#authLevel").innerText =
        userData.user.authorizationLevelDescription;
      document.querySelector(".pq-hide").classList.remove("pq-hide");
    }
  }
}
