import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ViewerPage } from "./pages/ViewerPage";
import { RoomCreatePage } from "./pages/RoomCreatePage";
import { RoomJoinPage } from "./pages/RoomJoinPage";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room") ?? "";
const isViewer = window.location.pathname.startsWith("/view");

let content: React.ReactNode;
if (isViewer) {
  content = roomId ? <ViewerPage roomId={roomId} /> : <RoomJoinPage />;
} else {
  content = roomId ? <App roomId={roomId} /> : <RoomCreatePage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{content}</React.StrictMode>,
);
