import { useId } from "react";
import Explainer from "./Explainer.jsx";

// A labeled input. The error and the hint are tied to the input for screen readers.
export default function Field({ label, error, hint, explainer, as = "input", className = "", children, ...inputProps }) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const Control = as;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{explainer && <Explainer text={explainer} />}</label>
      <Control id={id} className={`input ${className}`.trim()} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} {...inputProps}>{children}</Control>
      {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
    </div>
  );
}
