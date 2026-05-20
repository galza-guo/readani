import type { PageDoc } from "../types";
import type { EpubParagraph } from "../components/document/EpubViewer";

const PARAGRAPHS_PER_PAGE = 20;

function normalizeHref(href: string): string {
  return href.split("#")[0];
}

function matchHref(targetHref: string, sourceHref: string): boolean {
  const target = normalizeHref(targetHref);
  const source = normalizeHref(sourceHref);
  return (
    target === source || target.endsWith(source) || source.endsWith(target)
  );
}

export function splitEpubParagraphsIntoPages(
  paragraphs: EpubParagraph[],
): PageDoc[] {
  const epubPages: PageDoc[] = [];

  let pageNum = 1;
  let chunk: EpubParagraph[] = [];
  let chunkHref: string | undefined;
  let chunkTitle: string | undefined;

  const flushChunk = () => {
    if (chunk.length === 0) return;
    epubPages.push({
      page: pageNum,
      title: chunkTitle,
      isExtracted: true,
      paragraphs: chunk.map((p) => ({
        pid: p.pid,
        page: pageNum,
        source: p.source,
        translation: p.translation,
        status: p.status,
        rects: [],
        epubHref: p.href,
        sectionTitle: p.sectionTitle,
      })),
    });
    pageNum += 1;
    chunk = [];
    chunkHref = undefined;
    chunkTitle = undefined;
  };

  for (const paragraph of paragraphs) {
    const nextHref = paragraph.href;
    const startsNewSection = Boolean(
      chunkHref && nextHref && !matchHref(chunkHref, nextHref),
    );
    const chunkFull = chunk.length >= PARAGRAPHS_PER_PAGE;
    if (startsNewSection || chunkFull) {
      flushChunk();
    }

    if (chunk.length === 0) {
      chunkHref = nextHref;
      chunkTitle = paragraph.sectionTitle;
    }

    chunk.push(paragraph);
  }

  flushChunk();

  return epubPages;
}

export { normalizeHref, matchHref };
