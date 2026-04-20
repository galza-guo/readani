import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { NavItem } from "epubjs";

type EpubNavigationSidebarProps = {
  toc: NavItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
};

export function EpubNavigationSidebar({
  toc,
  currentChapter,
  onNavigate,
}: EpubNavigationSidebarProps) {
  return (
    <aside className="epub-sidebar" aria-label="EPUB navigation">
      <div className="epub-sidebar-title type-section-title">Contents</div>
      <ScrollArea.Root className="epub-toc-scroll">
        <ScrollArea.Viewport className="epub-toc-viewport">
          <div className="epub-toc">
            {toc.length === 0 ? (
              <div className="pdf-contents-empty">No contents available.</div>
            ) : (
              toc.map((item, index) => (
                <button
                  key={item.href || index}
                  className={`epub-toc-item ${currentChapter === item.label ? "is-active" : ""}`}
                  onClick={() => onNavigate(item.href)}
                  type="button"
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="scrollbar">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
