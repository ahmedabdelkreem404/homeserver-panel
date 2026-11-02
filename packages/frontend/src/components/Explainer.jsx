import { useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n/index.js";

// The small (!) next to a non-obvious control: what it is and why it exists. Opens on click, focus or hover; Escape closes it.
export default function Explainer({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    const onPointer = event => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open]);

  return (
    <span className="explainer" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="explainer-trigger" aria-expanded={open} aria-describedby={open ? id : undefined} aria-label={t("common.explainer")} onClick={() => setOpen(o => !o)} onFocus={() => setOpen(true)} onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}>!</button>
      {open && <span id={id} role="tooltip" className="explainer-bubble">{text}</span>}
    </span>
  );
}
