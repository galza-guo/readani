import type { ReactNode } from "react";

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type PageNavigationToolbarProps = {
  children: ReactNode;
  previousLabel: string;
  nextLabel: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function PageNavigationToolbar({
  children,
  previousLabel,
  nextLabel,
  previousDisabled,
  nextDisabled,
  onPrevious,
  onNext,
}: PageNavigationToolbarProps) {
  return (
    <div className="document-panel-toolbar document-page-toolbar">
      <button
        type="button"
        className="btn btn-ghost btn-icon-only document-toolbar-icon-btn"
        onClick={onPrevious}
        disabled={previousDisabled}
        aria-label={previousLabel}
        title={previousLabel}
      >
        <ChevronLeftIcon />
      </button>
      <div className="document-page-toolbar-main">{children}</div>
      <button
        type="button"
        className="btn btn-ghost btn-icon-only document-toolbar-icon-btn"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}
