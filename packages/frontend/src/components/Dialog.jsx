import { useEffect, useId, useRef } from "react";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";
import { t } from "../i18n/index.js";

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A modal dialog: focus moves in, Tab stays inside, Escape closes (unless dismissible is false), focus returns to where it was.
export default function Dialog({ title, onClose, children, wide = false, dismissible = true }) {
  const titleId = useId();
  const box = useRef(null);

  useEffect(() => {
    const before = document.activeElement;
    const first = box.current?.querySelector("[data-autofocus]") ?? box.current?.querySelector(FOCUSABLE) ?? box.current;
    first?.focus();
    return () => { if (before instanceof HTMLElement && document.contains(before)) before.focus(); };
  }, []);

  const onKeyDown = event => {
    if (event.key === "Escape" && dismissible) { event.stopPropagation(); onClose?.(); return; }
    if (event.key !== "Tab") return;
    const nodes = [...box.current.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) { event.preventDefault(); return; }
    const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === firstNode) { event.preventDefault(); lastNode.focus(); }
    else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode.focus(); }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (dismissible && event.target === event.currentTarget) onClose?.(); }}>
      <div className={`dialog ${wide ? "dialog-wide" : ""}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={box} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          {dismissible && <Button variant="ghost" icon size="sm" onClick={onClose} aria-label={t("common.close")}><Icon name="close" className="nav-icon" size={18} /></Button>}
        </div>
        {children}
      </div>
    </div>
  );
}
