export default function Badge({ kind = "neutral", children, ...rest }) {
  return <span className={`badge ${kind === "neutral" ? "" : `badge-${kind}`}`.trim()} {...rest}>{children}</span>;
}
