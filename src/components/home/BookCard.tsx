import { useCallback } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Progress from "@radix-ui/react-progress";
import { Trash } from "@phosphor-icons/react";
import type { RecentBook } from "../../types";
import { t } from "../../lib/i18n";

type BookListItemProps = {
  book: RecentBook;
  onOpen: (book: RecentBook) => void;
  onRemove: (book: RecentBook) => void;
};

function PdfIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="book-icon book-icon-pdf">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" opacity="0.15" />
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="book-icon book-icon-epub">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="currentColor" opacity="0.15" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="currentColor" opacity="0.15" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return t("home.justNow");
  if (diffMins < 60) return t("home.minutesAgo", { count: String(diffMins) });
  if (diffHours < 24) return t("home.hoursAgo", { count: String(diffHours) });
  if (diffDays < 7) return t("home.daysAgo", { count: String(diffDays) });

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export function BookCard({ book, onOpen, onRemove }: BookListItemProps) {
  const progressPercent = Math.round(book.progress);

  const handleRemove = useCallback((e: Event) => {
    e.preventDefault();
    onRemove(book);
  }, [book, onRemove]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="book-card" onClick={() => onOpen(book)}>
          <div className="book-card-icon">
            {book.fileType === 'epub' ? <EpubIcon /> : <PdfIcon />}
          </div>
          <div className="book-card-content">
            <div className="book-card-title">{book.title}</div>
            <div className="book-card-meta">
              <span className="book-card-badge">{book.fileType.toUpperCase()}</span>
              <span className="book-card-dot" />
              <span className="book-card-time">{formatRelativeTime(book.lastOpenedAt)}</span>
            </div>
          </div>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="book-card-progress">
                <Progress.Root className="progress-root" value={progressPercent}>
                  <Progress.Indicator
                    className="progress-indicator"
                    style={{ transform: `translateX(-${100 - progressPercent}%)` }}
                  />
                </Progress.Root>
                <span className="book-card-progress-text">{progressPercent}%</span>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={5}>
                {progressPercent}% read · Page {book.lastPage} of {book.totalPages}
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu">
          <ContextMenu.Item className="context-menu-item context-menu-item-danger" onSelect={handleRemove}>
            <Trash size={14} />
            <span>{t("home.removeFromRecent")}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
