document.querySelector("#login").addEventListener("click", async (e) => {
  e.preventDefault();
  document.querySelector(".pq-error").classList.add("pq-hide");
  try {
    data = {
      userName: document.querySelector("#user-name").value,
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
      const result = await response.json();
      const tokenInput = document.createElement("input");
      tokenInput.name = "token"
      tokenInput.value = result.data;

      const dynamicForm = document.createElement("form");
      dynamicForm.method = "post";
      dynamicForm.action = "/login";
      dynamicForm.classList.add("pq-hide");
      dynamicForm.appendChild(tokenInput);
      document.body.appendChild(dynamicForm);
      dynamicForm.submit();
    } else {
      document.querySelector(".pq-error").classList.remove("pq-hide");
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
