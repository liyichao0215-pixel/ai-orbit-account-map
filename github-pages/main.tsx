import { createRoot } from "react-dom/client";
import { OrbitApp } from "../app/OrbitApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到 GitHub Pages 应用挂载节点。");
}

createRoot(root).render(<OrbitApp />);
