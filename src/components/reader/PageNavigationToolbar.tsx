import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

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
        <CaretLeft size={18} weight="bold" />
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
        <CaretRight size={18} weight="bold" />
      </button>
    </div>
  );
}
