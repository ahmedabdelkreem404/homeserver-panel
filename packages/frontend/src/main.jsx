import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, readTheme } from "./lib/theme.js";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/layout.css";

applyTheme(readTheme());
createRoot(document.getElementById("root")).render(<App />);
