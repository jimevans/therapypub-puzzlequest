import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { reloadWhenChunksAreReplaced } from "./app/reloadOnNewDeployment";
import { registerServiceWorker } from "./app/serviceWorker";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no element to show the app in");
}

reloadWhenChunksAreReplaced();
registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
