import { useMemo } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfThumbnailList } from "./PdfThumbnailList";
import type { PdfNavTab, PdfOutlineLink } from "../lib/pdfNavigation";

type PdfNavigationSidebarProps = {
  docId: string;
  pdfDoc: PDFDocumentProxy;
  pageSizes: { width: number; height: number }[];
  currentPage: number;
  outline: PdfOutlineLink[];
  activeTab: PdfNavTab;
  onTabChange: (tab: PdfNavTab) => void;
  onNavigate: (page: number) => void;
};

export function PdfNavigationSidebar({
  docId,
  pdfDoc,
  pageSizes,
  currentPage,
  outline,
  activeTab,
  onTabChange,
  onNavigate,
}: PdfNavigationSidebarProps) {
  const activeOutlineId = useMemo(() => {
    const currentOrEarlier = outline.filter((item) => item.page <= currentPage);
    if (currentOrEarlier.length > 0) {
      return currentOrEarlier[currentOrEarlier.length - 1]?.id ?? null;
    }

    return outline[0]?.id ?? null;
  }, [currentPage, outline]);

  return (
    <aside className="pdf-sidebar" aria-label="PDF navigation">
      <Tabs.Root
        className="pdf-sidebar-tabs"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as PdfNavTab)}
      >
        <Tabs.List className="pdf-sidebar-tabs-list" aria-label="PDF navigation views">
          <Tabs.Trigger className="pdf-sidebar-tab-trigger" value="thumbnails">
            Thumbnails
          </Tabs.Trigger>
          <Tabs.Trigger className="pdf-sidebar-tab-trigger" value="contents">
            Contents
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content className="pdf-sidebar-content" value="thumbnails">
          <PdfThumbnailList
            docId={docId}
            pdfDoc={pdfDoc}
            pageSizes={pageSizes}
            currentPage={currentPage}
            onNavigate={onNavigate}
          />
        </Tabs.Content>

        <Tabs.Content className="pdf-sidebar-content" value="contents">
          {outline.length === 0 ? (
            <div className="pdf-contents-empty">No contents available.</div>
          ) : (
            <ScrollArea.Root className="pdf-contents-scroll">
              <ScrollArea.Viewport className="pdf-contents-viewport">
                <div className="pdf-contents-list">
                  {outline.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pdf-contents-item ${item.id === activeOutlineId ? "is-active" : ""}`}
                      style={{ paddingLeft: `${12 + item.depth * 14}px` }}
                      onClick={() => onNavigate(item.page)}
                    >
                      <span className="pdf-contents-title">{item.title}</span>
                      <span className="pdf-contents-page">{item.page}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical" className="scrollbar">
                <ScrollArea.Thumb className="scrollbar-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
