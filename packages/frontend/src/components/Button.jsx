export default function Button({ variant = "default", size, busy = false, block = false, icon = false, className = "", disabled, type = "button", children, ...rest }) {
  const classes = ["btn", variant !== "default" && `btn-${variant}`, size && `btn-${size}`, block && "btn-block", icon && "btn-icon", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
