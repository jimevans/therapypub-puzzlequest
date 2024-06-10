document.querySelector("#login").addEventListener("click", async (e) => {
  try {
    data = {
      userName: document.querySelector("#userName").value,
      password: document.querySelector("#password").value,
    };
    const response = await fetch("/api/users/login", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const data = await response.json();
      document.querySelector("#token").value = data["token"];
      document.querySelector("#tokenForm").submit();
    } else {
      document.querySelector(".loginError").hidden = false;
    }
  } catch (err) {
    console.log("error: " + err);
  }
});

document
  .querySelector("#cancel")
  .addEventListener("click", (e) => (window.location.href = "/"));
