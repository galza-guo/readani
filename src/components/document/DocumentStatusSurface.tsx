type DocumentStatusSurfaceProps = {
  message: string;
  progress?: number | null;
  variant?: "blocking" | "overlay";
};

export function DocumentStatusSurface({
  message,
  progress = null,
  variant = "blocking",
}: DocumentStatusSurfaceProps) {
  return (
    <div
      className={`document-status-surface document-status-surface-${variant}`}
      aria-live="polite"
      role="status"
    >
      <div className="document-status-message">{message}</div>
      {progress !== null ? (
        <div className="document-status-progress-track" aria-hidden="true">
          <div
            className="document-status-progress-fill"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
