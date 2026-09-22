import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import ControlTower from "./ControlTower.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ControlTower />
    <Analytics />
  </React.StrictMode>
);
