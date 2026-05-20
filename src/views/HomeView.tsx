import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { BookOpen, Info, GearSix, Trash } from "@phosphor-icons/react";
import { ExpandableIconButton } from "../components/reader/ExpandableIconButton";
import { FileIcon } from "../components/FileIcon";
import { ThemeToggleButton } from "../components/ThemeToggleButton";
import { UpdateActionButton } from "../components/UpdateActionButton";
import type { RecentBook, ThemeMode } from "../types";
import readaniBannerForDarkTheme from "../assets/readani-banner-dark-theme.png";
import readaniBannerForLightTheme from "../assets/readani-banner-light-theme.png";
import { t } from "../lib/i18n";

type HomeViewProps = {
  onOpenBook: (book: RecentBook) => void;
  onOpenFile: () => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  showTranslationSetupCallout?: boolean;
  theme: ThemeMode;
  onThemeToggle: () => void;
  showUpdateAction?: boolean;
  onInstallUpdate?: () => void;
  openingDocumentTitle?: string | null;
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t("home.justNow");
  if (diffMins < 60) return t("home.minutesAgo", { count: String(diffMins) });
  if (diffHours < 24) return t("home.hoursAgo", { count: String(diffHours) });
  if (diffDays < 7) return t("home.daysAgo", { count: String(diffDays) });

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HomeView({
  onOpenBook,
  onOpenFile,
  onOpenAbout,
  onOpenSettings,
  showTranslationSetupCallout = false,
  theme,
  onThemeToggle,
  showUpdateAction = false,
  onInstallUpdate,
  openingDocumentTitle = null,
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
        <div className="home-header-tools">
          <div className="home-header-actions">
            {showUpdateAction && onInstallUpdate ? (
              <UpdateActionButton onClick={onInstallUpdate} />
            ) : null}
            <ExpandableIconButton
              aria-label={t("common.about")}
              label={t("common.about")}
              labelDirection="left"
              onClick={onOpenAbout}
            >
              <Info size={18} />
            </ExpandableIconButton>
            <ThemeToggleButton
              theme={theme}
              onToggle={onThemeToggle}
              showHoverLabel={true}
              labelDirection="left"
              hoverLabel={t("theme.switch")}
            />
            <ExpandableIconButton
              aria-label={t("common.settings")}
              label={t("common.settings")}
              labelDirection="left"
              onClick={onOpenSettings}
            >
              <GearSix size={18} />
            </ExpandableIconButton>
          </div>
          {showTranslationSetupCallout ? (
            <div className="home-setup-callout">
              <span>{t("home.translationNotSetUp")}</span>
              <button className="home-setup-callout-link" onClick={onOpenSettings} type="button">
                {t("home.openSettings")}
              </button>
            </div>
          ) : null}
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
            <p className="home-subtitle">{t("home.languageBarriersRemoved")}</p>
          </div>

          {/* Drop zone */}
          <div className="home-dropzone" onClick={onOpenFile}>
            <BookOpen size={24} />
            <div className="home-dropzone-text">
              <span className="home-dropzone-title type-section-title">{t("home.openPdfOrEpub")}</span>
              <span className="home-dropzone-hint">{t("home.clickToBrowse")}</span>
            </div>
            <span className="home-dropzone-shortcut">{t("home.shortcutHint")}</span>
          </div>
          {openingDocumentTitle ? (
            <div className="home-opening-status" aria-live="polite" role="status">
              <span className="home-opening-status-dot" aria-hidden="true" />
              <span>{t("home.openingDocument", { title: openingDocumentTitle })}</span>
            </div>
          ) : null}
          {/* Recent files */}
          {loading ? (
            <div className="home-loading"><div className="home-spinner" /></div>
          ) : hasBooks ? (
            <div className="home-recent">
              <div className="home-recent-title type-section-title">{t("home.recent")}</div>
              <ScrollArea.Root className="home-recent-scroll">
                <ScrollArea.Viewport className="home-recent-viewport">
                  <div className="home-recent-list">
                    {books.map((book) => (
                      <ContextMenu.Root key={book.id}>
                        <ContextMenu.Trigger asChild>
                          <div className="home-file-row">
                            <button className="home-file" onClick={() => onOpenBook(book)} type="button">
                              <span className="home-file-icon">
                                <FileIcon kind={book.fileType === 'epub' ? 'epub' : 'pdf'} />
                              </span>
                              <span className="home-file-info">
                                <span className="home-file-name">{book.title}</span>
                                <span className="home-file-meta">{Math.round(book.progress)}% · {formatRelativeTime(book.lastOpenedAt)}</span>
                              </span>
                            </button>
                            <button
                              aria-label={t("home.removeFromRecentWithTitle", { title: book.title })}
                              className="home-file-delete"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRemove(book);
                              }}
                              title={t("home.removeFromRecent")}
                              type="button"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                          <ContextMenu.Content className="context-menu">
                            <ContextMenu.Item className="context-menu-item context-menu-item-danger" onSelect={() => handleRemove(book)}>
                              <Trash size={14} />
                              <span>{t("home.remove")}</span>
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
            {t("home.translationDisclaimer")}
          </div>
        </div>
      </main>
    </div>
  );
}
