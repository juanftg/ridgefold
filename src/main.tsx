import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RidgefoldApp } from "./game/RidgefoldApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RidgefoldApp />
  </StrictMode>,
);
