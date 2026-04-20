import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { ExpandableIconButton } from "../components/reader/ExpandableIconButton";
import { ThemeToggleButton } from "../components/ThemeToggleButton";
import type { RecentBook, ThemeMode } from "../types";
import readaniBannerForDarkTheme from "../assets/readani-banner-dark-theme.png";
import readaniBannerForLightTheme from "../assets/readani-banner-light-theme.png";

type HomeViewProps = {
  onOpenBook: (book: RecentBook) => void;
  onOpenFile: () => void;
  onOpenSettings: () => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
};

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#e74c3c" opacity="0.15" />
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#e74c3c" strokeWidth="1.5" fill="none" />
      <polyline points="14 2 14 8 20 8" stroke="#e74c3c" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="#27ae60" opacity="0.15" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#27ae60" strokeWidth="1.5" fill="none" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#27ae60" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HomeView({
  onOpenBook,
  onOpenFile,
  onOpenSettings,
  theme,
  onThemeToggle,
}: HomeViewProps) {
  const [books, setBooks] = useState<RecentBook[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBooks = useCallback(async () => {
    try {
      const result = await invoke<RecentBook[]>("get_recent_books");
      const mapped = result.map((book: any) => ({
        id: book.id,
        filePath: book.file_path,
        fileName: book.file_name,
        fileType: book.file_type,
        title: book.title,
        author: book.author,
        coverImage: book.cover_image,
        totalPages: book.total_pages,
        lastPage: book.last_page,
        progress: book.progress,
        lastOpenedAt: book.last_opened_at,
      }));
      setBooks(mapped);
    } catch (error) {
      console.error("Failed to load recent books:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleRemove = useCallback(async (book: RecentBook) => {
    try {
      await invoke("remove_recent_book", { id: book.id });
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    } catch (error) {
      console.error("Failed to remove book:", error);
    }
  }, []);

  const hasBooks = !loading && books.length > 0;

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-actions">
          <ThemeToggleButton
            theme={theme}
            onToggle={onThemeToggle}
            showHoverLabel={true}
            labelDirection="left"
            hoverLabel="Theme"
          />
          <ExpandableIconButton
            aria-label="Settings"
            label="Settings"
            labelDirection="left"
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </ExpandableIconButton>
        </div>
      </header>

      <main className="home-main">
        <div className="home-content">
          {/* Branding */}
          <div className="home-branding">
            <div className="home-logo" role="img" aria-label="readani">
              <img
                src={readaniBannerForLightTheme}
                alt=""
                aria-hidden="true"
                className="home-logo-img home-logo-img--light"
              />
              <img
                src={readaniBannerForDarkTheme}
                alt=""
                aria-hidden="true"
                className="home-logo-img home-logo-img--dark"
              />
            </div>
            <p className="home-subtitle">Language barriers removed.</p>
          </div>

          {/* Drop zone */}
          <div className="home-dropzone" onClick={onOpenFile}>
            <UploadIcon />
            <div className="home-dropzone-text">
              <span className="home-dropzone-title type-section-title">Open PDF or EPUB</span>
              <span className="home-dropzone-hint">Click to browse or drag file here</span>
            </div>
            <span className="home-dropzone-shortcut">⌘O</span>
          </div>
          {/* Recent files */}
          {loading ? (
            <div className="home-loading"><div className="home-spinner" /></div>
          ) : hasBooks ? (
            <div className="home-recent">
              <div className="home-recent-title type-section-title">Recent</div>
              <ScrollArea.Root className="home-recent-scroll">
                <ScrollArea.Viewport className="home-recent-viewport">
                  <div className="home-recent-list">
                    {books.map((book) => (
                      <ContextMenu.Root key={book.id}>
                        <ContextMenu.Trigger asChild>
                          <button className="home-file" onClick={() => onOpenBook(book)}>
                            <span className="home-file-icon">
                              {book.fileType === 'epub' ? <EpubIcon /> : <PdfIcon />}
                            </span>
                            <span className="home-file-info">
                              <span className="home-file-name">{book.title}</span>
                              <span className="home-file-meta">{Math.round(book.progress)}% · {formatRelativeTime(book.lastOpenedAt)}</span>
                            </span>
                          </button>
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                          <ContextMenu.Content className="context-menu">
                            <ContextMenu.Item className="context-menu-item context-menu-item-danger" onSelect={() => handleRemove(book)}>
                              <TrashIcon />
                              <span>Remove</span>
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Portal>
                      </ContextMenu.Root>
                    ))}
                  </div>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical" className="scrollbar">
                  <ScrollArea.Thumb className="scrollbar-thumb" />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>
            </div>
          ) : null}

          <div className="home-disclaimer">
            Translation quality depends on the provider, model, and the quality of the PDF or OCR text.
          </div>
        </div>
      </main>
    </div>
  );
}
