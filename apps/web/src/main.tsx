import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebCheck } from "./WebCheck";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no element to show the app in");
}

createRoot(root).render(
  <StrictMode>
    <WebCheck />
  </StrictMode>
);
