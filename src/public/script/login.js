document.querySelector("#login").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    data = {
      userName: document.querySelector("#userName").value,
      password: document.querySelector("#password").value,
    };
    const response = await fetch("/api/user/login", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const data = await response.json();
      const tokenInput = document.createElement("input");
      tokenInput.name = "token"
      tokenInput.value = data["token"];

      const dynamicForm = document.createElement("form");
      dynamicForm.method = "post";
      dynamicForm.action = "/login";
      dynamicForm.hidden = true;
      dynamicForm.appendChild(tokenInput);
      document.body.appendChild(dynamicForm);
      dynamicForm.submit();
    } else {
      document.querySelector(".loginError").hidden = false;
    }
  } catch (err) {
    console.log("error: " + err);
  }
});

document
  .querySelector("#cancel")
  .addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/";
  });
