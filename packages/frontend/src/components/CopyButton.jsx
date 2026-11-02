import { useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";
import { t } from "../i18n/index.js";

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const area = document.createElement("textarea"); // older or non secure contexts
  area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
  document.body.appendChild(area); area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

export default function CopyButton({ text, label = t("common.copy"), size = "sm", ...rest }) {
  const [done, setDone] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await writeClipboard(text); setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 2000); } catch { setDone(false); }
  };
  return (
    <Button size={size} onClick={copy} {...rest}>
      <Icon name={done ? "check" : "copy"} className="nav-icon" size={16} />
      <span aria-live="polite">{done ? t("common.copied") : label}</span>
    </Button>
  );
}
