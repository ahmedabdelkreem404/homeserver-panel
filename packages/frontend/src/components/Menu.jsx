import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button.jsx";
import { t } from "../i18n/index.js";

const ENABLED_ITEMS = '[role="menuitem"]:not(:disabled)';

// A button that opens a list of actions. Arrow keys move, Escape closes, a click outside closes.
export default function Menu({ label, items, size = "sm" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector(ENABLED_ITEMS)?.focus();
    const onPointer = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = event => {
    if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const enabled = [...root.current.querySelectorAll(ENABLED_ITEMS)];
    if (!enabled.length) return;
    const at = enabled.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (at + 1) % enabled.length : (at - 1 + enabled.length) % enabled.length;
    event.preventDefault();
    enabled[next]?.focus();
  };

  return (
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      <Button size={size} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)}>{label ?? t("common.menu")} <span aria-hidden="true">▾</span></Button>
      {open && (
        <div className="menu-list" role="menu" id={id}>
          {items.map(item => (
            <button key={item.key} type="button" role="menuitem" className={`menu-item ${item.danger ? "menu-item-danger" : ""}`.trim()} disabled={item.disabled} title={item.title} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
