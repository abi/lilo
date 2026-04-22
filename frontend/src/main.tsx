import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./components/auth/AuthGate";
import { initializeLogRocket } from "./lib/logrocket";
import { initializeSentry } from "./lib/sentry";
import App from "./App";
import "./index.css";

initializeSentry();
initializeLogRocket();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);
