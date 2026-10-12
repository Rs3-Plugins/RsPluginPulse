interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = "Reset", onConfirm, onCancel }: Props) {
  return (
    <div className="legal-overlay" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="legal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-edge" />
        <div className="legal-dialog-header">
          <h2>{title}</h2>
          <button className="legal-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="legal-body">
          <p>{message}</p>
        </div>
        <div className="legal-dialog-footer" style={{ gap: 10 }}>
          <button className="theme-toggle" onClick={onCancel}>
            Cancel
          </button>
          <button className="legal-ok" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
