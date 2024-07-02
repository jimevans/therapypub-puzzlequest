document.querySelector("#edit").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/quest/${quest}/edit`;
});
document.querySelector("#close").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `/`;
});
