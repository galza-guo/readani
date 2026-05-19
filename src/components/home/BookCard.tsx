import { useCallback } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Progress from "@radix-ui/react-progress";
import { Trash } from "@phosphor-icons/react";
import type { RecentBook } from "../../types";
import { t } from "../../lib/i18n";
import { FileIcon } from "../FileIcon";

type BookListItemProps = {
  book: RecentBook;
  onOpen: (book: RecentBook) => void;
  onRemove: (book: RecentBook) => void;
};

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
            <FileIcon kind={book.fileType === 'epub' ? 'epub' : 'pdf'} size={20} />
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
