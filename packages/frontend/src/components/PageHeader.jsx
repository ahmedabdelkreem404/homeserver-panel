export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div><h1 tabIndex={-1} data-page-title>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
