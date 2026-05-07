import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ViewerPage } from "./pages/ViewerPage";
import "./index.css";

const isViewer = window.location.pathname.startsWith("/view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isViewer ? <ViewerPage /> : <App />}
  </React.StrictMode>
);
