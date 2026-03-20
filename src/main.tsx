import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./styles/global.css";

// Keyboard shortcuts for navigation (macOS standard: Cmd+[ = back, Cmd+] = forward)
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key === '[') {
    e.preventDefault();
    window.history.back();
  }
  if (e.metaKey && e.key === ']') {
    e.preventDefault();
    window.history.forward();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
