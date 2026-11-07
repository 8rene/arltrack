import React from "react";
import "./styles/index.css";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import showConsoleWarning from "./utils/securityWarning.js";

showConsoleWarning(); // "Stop!" warning in the browser console (see utils/securityWarning.js)

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
