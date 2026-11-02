import Icon from "./Icon.jsx";

export default function Alert({ kind = "danger", title, children, ...rest }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : "status"} {...rest}>
      <Icon name={kind === "success" ? "check" : "warning"} className="nav-icon" />
      <div>{title && <strong>{title} </strong>}{children}</div>
    </div>
  );
}
