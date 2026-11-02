import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { errorMessage } from "./api.js";
import { t } from "../i18n/index.js";

const ToastContext = createContext({ success() {}, error() {}, info() {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children, durationMs = 6000 }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback(id => setItems(list => list.filter(item => item.id !== id)), []);
  const push = useCallback((kind, text) => {
    const id = nextId.current++;
    setItems(list => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), durationMs);
  }, [dismiss, durationMs]);

  const api = useMemo(() => ({
    success: text => push("success", text),
    info: text => push("info", text),
    error: errorOrText => push("error", typeof errorOrText === "string" ? errorOrText : errorMessage(errorOrText)),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(item => (
          <div key={item.id} className={`toast toast-${item.kind}`}>
            <div className="row-between">
              <span>{item.text}</span>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={t("common.dismiss")} onClick={() => dismiss(item.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
