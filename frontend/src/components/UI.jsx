export function Loader({ text = "Loading..." }) {
  return (
    <div className="loader">
      <span className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card skeleton-card" key={i}>
          <div className="skeleton" style={{ height: 96, margin: "-22px -22px 16px", borderRadius: 0 }} />
          <div className="skeleton" style={{ width: "70%", height: 18 }} />
          <div className="skeleton" style={{ width: "40%", height: 12, marginTop: 10 }} />
          <div className="skeleton" style={{ width: "90%", height: 12, marginTop: 18 }} />
          <div className="skeleton" style={{ width: "80%", height: 12, marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, text, children }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children, back }) {
  return (
    <div className="page-header">
      <div>
        {back}
        <h2>{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

// label
export function Tag({ label, children }) {
  return (
    <div className="meta">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{children}</span>
    </div>
  );
}
