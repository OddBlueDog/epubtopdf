import "@/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/app";

const container = document.querySelector("#root");
if (container === null) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
