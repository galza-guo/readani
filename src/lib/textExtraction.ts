import type { PDFPageProxy } from "pdfjs-dist";
import type { Paragraph } from "../types";
import { hashString } from "./hash";

export type GlyphItem = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lineId: number;
  isVertical: boolean;
  columnIndex: number;
  rotation: number;
  direction?: string;
  styleVertical?: boolean;
};

type Line = {
  id: number;
  y: number;
  items: GlyphItem[];
};

type TextBlock = {
  items: GlyphItem[];
  text?: string;
};

type WritingMode = "horizontal" | "vertical";

type ReadingCharUnit = {
  char: string;
  item: GlyphItem;
  itemIndex: number;
};

type ReadingTextBuildResult = {
  text: string;
  units: ReadingCharUnit[];
  outputMap: number[];
};

function normalizeTextItems(page: PDFPageProxy, scale: number): Promise<GlyphItem[]> {
  return page.getTextContent().then((content) => {
    const viewport = page.getViewport({ scale });
    const items: GlyphItem[] = [];
    const styles = content.styles ?? {};

    for (const item of content.items as any[]) {
      const text = String(item.str ?? "").trim();
      if (!text) continue;

      const style = styles[item.fontName] ?? null;
      const transform = (window as any).pdfjsLib.Util.transform(viewport.transform, item.transform);
      const a = transform[0];
      const b = transform[1];
      const c = transform[2];
      const d = transform[3];
      const x = transform[4];
      const y = transform[5];
      const fontHeight = Math.hypot(transform[2], transform[3]);
      const w = item.width * viewport.scale;
      const h = fontHeight;
      const top = y - h;
      const isVertical =
        style?.vertical === true ||
        item.dir === "ttb" ||
        Math.abs(b) + Math.abs(c) > Math.abs(a) + Math.abs(d);

      // Calculate rotation angle from transform matrix
      const rotation = Math.atan2(b, a) * (180 / Math.PI);

      items.push({
        text,
        x,
        y: top,
        w,
        h,
        lineId: -1,
        isVertical,
        columnIndex: 0,
        rotation,
        direction: item.dir,
        styleVertical: style?.vertical === true,
      });
    }

    return items;
  });
}

// Common watermark patterns to filter out
const WATERMARK_PATTERNS = [
  /^(educational|sample|draft|confidential|watermark|preview|demo)$/i,
  /^(educational\s*sample|sample\s*copy|not\s*for\s*distribution)$/i,
];

function isWatermarkText(item: GlyphItem): boolean {
  // Check if text matches common watermark patterns
  const text = item.text.toLowerCase();
  for (const pattern of WATERMARK_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  if (isLikelyVerticalItem(item)) {
    return false;
  }

  // Check if text is significantly rotated (watermarks are often diagonal)
  const absRotation = Math.abs(item.rotation);
  if (absRotation > 10 && absRotation < 170) {
    // Rotated text that's not horizontal
    return true;
  }

  return false;
}

export function filterWatermarks(items: GlyphItem[]): { content: GlyphItem[]; watermarks: GlyphItem[] } {
  const content: GlyphItem[] = [];
  const watermarks: GlyphItem[] = [];

  for (const item of items) {
    if (isWatermarkText(item)) {
      watermarks.push(item);
    } else {
      content.push(item);
    }
  }

  return { content, watermarks };
}

function detectColumnBoundaries(items: GlyphItem[], pageWidth: number): number[] {
  if (items.length === 0) return [0, pageWidth];

  // Step 1: Group items into approximate lines by Y coordinate
  const lineThreshold = 10; // Items within 10px Y are on the same line
  const sortedByY = [...items].sort((a, b) => a.y - b.y);

  const lines: GlyphItem[][] = [];
  let currentLine: GlyphItem[] = [];
  let currentY = sortedByY[0]?.y ?? 0;

  for (const item of sortedByY) {
    if (currentLine.length === 0 || Math.abs(item.y - currentY) <= lineThreshold) {
      currentLine.push(item);
      // Update Y as running average
      currentY = currentLine.reduce((sum, i) => sum + i.y, 0) / currentLine.length;
    } else {
      if (currentLine.length > 0) lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Step 2: For each line, find horizontal gaps between items
  const gaps: { x: number; width: number }[] = [];
  const minGapWidth = pageWidth * 0.05; // At least 5% of page width to be a column gap

  for (const line of lines) {
    if (line.length < 2) continue;

    // Sort items in line by X position
    const sortedLine = [...line].sort((a, b) => a.x - b.x);

    for (let i = 0; i < sortedLine.length - 1; i++) {
      const current = sortedLine[i];
      const next = sortedLine[i + 1];
      const gapStart = current.x + current.w;
      const gapEnd = next.x;
      const gapWidth = gapEnd - gapStart;

      // Only consider significant gaps (not just word spacing)
      if (gapWidth > minGapWidth) {
        gaps.push({ x: (gapStart + gapEnd) / 2, width: gapWidth });
      }
    }
  }

  if (gaps.length === 0) {
    return [0, pageWidth]; // Single column
  }

  // Step 3: Cluster gaps by X position to find consistent column boundaries
  // Use a histogram approach with buckets
  const bucketSize = pageWidth / 100;
  const gapHistogram: number[] = new Array(100).fill(0);

  for (const gap of gaps) {
    const bucketIndex = Math.min(99, Math.max(0, Math.floor(gap.x / bucketSize)));
    gapHistogram[bucketIndex]++;
  }

  // Find peaks in the histogram (consistent gap positions across many lines)
  const minOccurrences = Math.max(3, lines.length * 0.15); // Gap must appear in at least 15% of lines
  const boundaries: number[] = [0];

  // Find contiguous regions with high gap counts
  let inPeak = false;
  let peakMax = 0;
  let peakMaxIndex = 0;

  for (let i = 0; i < gapHistogram.length; i++) {
    if (gapHistogram[i] >= minOccurrences) {
      if (!inPeak) {
        inPeak = true;
        peakMax = gapHistogram[i];
        peakMaxIndex = i;
      } else if (gapHistogram[i] > peakMax) {
        peakMax = gapHistogram[i];
        peakMaxIndex = i;
      }
    } else if (inPeak) {
      // End of peak - add boundary at peak center
      const boundaryX = (peakMaxIndex + 0.5) * bucketSize;
      boundaries.push(boundaryX);
      inPeak = false;
    }
  }

  // Handle peak at the end
  if (inPeak) {
    const boundaryX = (peakMaxIndex + 0.5) * bucketSize;
    boundaries.push(boundaryX);
  }

  boundaries.push(pageWidth);

  // Validate: columns should be at least 20% of page width
  const minColumnWidth = pageWidth * 0.2;
  const validBoundaries: number[] = [0];

  for (let i = 1; i < boundaries.length; i++) {
    const columnWidth = boundaries[i] - validBoundaries[validBoundaries.length - 1];
    if (columnWidth >= minColumnWidth || i === boundaries.length - 1) {
      if (i < boundaries.length - 1) {
        validBoundaries.push(boundaries[i]);
      }
    }
  }
  validBoundaries.push(pageWidth);

  return validBoundaries;
}

function assignColumnsToItems(items: GlyphItem[], columnBoundaries: number[]): void {
  for (const item of items) {
    const itemCenter = item.x + item.w / 2;
    for (let i = 0; i < columnBoundaries.length - 1; i++) {
      if (itemCenter >= columnBoundaries[i] && itemCenter < columnBoundaries[i + 1]) {
        item.columnIndex = i;
        break;
      }
    }
  }
}

function groupItemsByColumn(items: GlyphItem[], numColumns: number): GlyphItem[][] {
  const columns: GlyphItem[][] = Array.from({ length: numColumns }, () => []);
  for (const item of items) {
    columns[item.columnIndex].push(item);
  }
  return columns;
}

function isLikelyVerticalItem(item: GlyphItem): boolean {
  return item.styleVertical === true || item.direction === "ttb" || item.isVertical;
}

function detectWritingMode(items: GlyphItem[]): WritingMode {
  if (items.length === 0) return "horizontal";
  let verticalScore = 0;
  let horizontalScore = 0;

  for (const item of items) {
    if (item.styleVertical === true) {
      verticalScore += 4;
    } else if (item.styleVertical === false) {
      horizontalScore += 2;
    }

    if (item.direction === "ttb") {
      verticalScore += 3;
    } else if (item.direction === "ltr" || item.direction === "rtl") {
      horizontalScore += 1;
    }

    if (item.isVertical) {
      verticalScore += 1;
    } else {
      horizontalScore += 0.5;
    }
  }

  return verticalScore > horizontalScore ? "vertical" : "horizontal";
}

function isCjkLikeChar(char: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    char,
  );
}

function isLatinOrNumberChar(char: string) {
  return /[\p{Script=Latin}\p{Number}]/u.test(char);
}

function isOpeningQuoteOrBracket(char: string) {
  return /[("'“‘«‹「『（［【〈《〔｛]/u.test(char);
}

function isClosingQuoteOrBracket(char: string) {
  return /[)"'”’»›」』）］】〉》〕｝〗〙〛]/u.test(char);
}

function isSentenceTerminalChar(char: string) {
  return /[.!?。！？｡．]/u.test(char);
}

function isSentenceSuffixChar(char: string) {
  return (
    /\s/u.test(char) ||
    isSentenceTerminalChar(char) ||
    isClosingQuoteOrBracket(char) ||
    /[…‥]/u.test(char)
  );
}

function shouldKeepWhitespaceBetween(prevChar?: string, nextChar?: string) {
  if (!prevChar || !nextChar) {
    return false;
  }

  if (isCjkLikeChar(prevChar) || isCjkLikeChar(nextChar)) {
    return false;
  }

  if (isOpeningQuoteOrBracket(prevChar) || isClosingQuoteOrBracket(nextChar)) {
    return false;
  }

  if (/[\p{P}\p{S}]/u.test(nextChar)) {
    return false;
  }

  return (
    (isLatinOrNumberChar(prevChar) ||
      /[,;:]/u.test(prevChar) ||
      isClosingQuoteOrBracket(prevChar)) &&
    isLatinOrNumberChar(nextChar)
  );
}

function shouldInsertSyntheticSpace(
  prevChar: string | undefined,
  nextChar: string,
  prevItem: GlyphItem | undefined,
  nextItem: GlyphItem,
  mode: WritingMode,
) {
  if (!prevChar || !prevItem) {
    return false;
  }

  if (mode === "vertical" || prevItem.isVertical || nextItem.isVertical) {
    return false;
  }

  if (isCjkLikeChar(prevChar) || isCjkLikeChar(nextChar)) {
    return false;
  }

  if (isOpeningQuoteOrBracket(prevChar) || isClosingQuoteOrBracket(nextChar)) {
    return false;
  }

  return (
    (isLatinOrNumberChar(prevChar) || /[,;:]/u.test(prevChar)) &&
    isLatinOrNumberChar(nextChar)
  );
}

function guessSentenceLocale(text: string) {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    return "ja";
  }
  if (/[\p{Script=Hangul}]/u.test(text)) {
    return "ko";
  }
  if (/[\p{Script=Han}]/u.test(text)) {
    return "zh";
  }
  return "en";
}

function normalizeTextForSentenceSegmentation(text: string) {
  return text
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\.(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      "$1・",
    )
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]),(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      "$1、",
    );
}

function normalizeExtractedText(text: string) {
  return normalizeTextForSentenceSegmentation(text)
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])，(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      "$1、",
    )
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])'(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      "$1",
    )
    .replace(
      /(^|[\p{P}\p{S}\s])'(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      "$1",
    );
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function filterVerticalMarginalia(items: GlyphItem[], pageHeight: number): GlyphItem[] {
  const verticalItems = items.filter(isLikelyVerticalItem);
  if (verticalItems.length === 0) return items;

  const top = Math.min(...verticalItems.map((item) => item.y));
  const bottom = Math.max(...verticalItems.map((item) => item.y + item.h));
  const medianSize = getMedian(verticalItems.map((item) => Math.max(item.w, item.h)));
  const edgeBand = Math.max(medianSize * 2, pageHeight * 0.03);

  return items.filter((item) => {
    if (isLikelyVerticalItem(item)) return true;
    if (item.y < pageHeight * 0.25 && item.text.length <= 24) {
      return true;
    }
    const itemBottom = item.y + item.h;
    return itemBottom >= top - edgeBand && item.y <= bottom + edgeBand;
  });
}

function groupIntoHorizontalLines(items: GlyphItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];

  for (const item of sorted) {
    const threshold = Math.max(2, item.h * 0.6);
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= threshold);
    if (!line) {
      line = { id: lines.length, y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    for (const item of line.items) {
      item.lineId = line.id;
    }
  }

  return lines.sort((a, b) => a.y - b.y);
}

function groupIntoVerticalColumns(items: GlyphItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.x - a.x || a.y - b.y);
  const columns: Line[] = [];
  const threshold = Math.max(6, getMedian(items.map((item) => Math.max(item.w, item.h))) * 0.5);

  for (const item of sorted) {
    const anchor = item.x + item.w / 2;
    let column = columns.find((candidate) => Math.abs(candidate.y - anchor) <= threshold);
    if (!column) {
      column = { id: columns.length, y: anchor, items: [] };
      columns.push(column);
    }
    column.items.push(item);
    column.y = (column.y * (column.items.length - 1) + anchor) / column.items.length;
  }

  for (const column of columns) {
    column.items.sort((a, b) => a.y - b.y);
    for (const item of column.items) {
      item.lineId = column.id;
    }
  }

  return columns.sort((a, b) => b.y - a.y);
}

function buildReadingText(lines: Line[], mode: WritingMode): ReadingTextBuildResult {
  const orderedItems = lines.flatMap((line) =>
    [...line.items].sort((left, right) =>
      mode === "vertical" ? left.y - right.y : left.x - right.x,
    ),
  );
  const units: ReadingCharUnit[] = [];

  orderedItems.forEach((item, itemIndex) => {
    for (const char of Array.from(item.text)) {
      units.push({ char, item, itemIndex });
    }
  });

  let text = "";
  const outputMap: number[] = [];
  let previousTextUnit: ReadingCharUnit | null = null;
  let previousTextChar: string | undefined;

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];

    if (/\s/u.test(unit.char)) {
      let nextVisibleChar: string | undefined;
      for (let lookahead = index + 1; lookahead < units.length; lookahead += 1) {
        if (!/\s/u.test(units[lookahead].char)) {
          nextVisibleChar = units[lookahead].char;
          break;
        }
      }

      if (
        shouldKeepWhitespaceBetween(previousTextChar, nextVisibleChar) &&
        !text.endsWith(" ")
      ) {
        text += " ";
        outputMap.push(-1);
      }
      continue;
    }

    if (
      previousTextUnit &&
      previousTextUnit.itemIndex !== unit.itemIndex &&
      !text.endsWith(" ") &&
      shouldInsertSyntheticSpace(
        previousTextChar,
        unit.char,
        previousTextUnit.item,
        unit.item,
        mode,
      )
    ) {
      text += " ";
      outputMap.push(-1);
    }

    text += unit.char;
    for (let offset = 0; offset < unit.char.length; offset += 1) {
      outputMap.push(index);
    }

    previousTextUnit = unit;
    previousTextChar = unit.char;
  }

  return { text, units, outputMap };
}

function fallbackSegmentTextRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceSuffixChar(text[index])) {
      continue;
    }

    let suffixEnd = index;
    let hasTerminal = isSentenceTerminalChar(text[index]);
    while (suffixEnd + 1 < text.length && isSentenceSuffixChar(text[suffixEnd + 1])) {
      suffixEnd += 1;
      hasTerminal ||= isSentenceTerminalChar(text[suffixEnd]);
    }

    if (hasTerminal) {
      ranges.push({ start: rangeStart, end: suffixEnd + 1 });
      rangeStart = suffixEnd + 1;
      index = suffixEnd;
    }
  }

  if (rangeStart < text.length) {
    ranges.push({ start: rangeStart, end: text.length });
  }

  return ranges.filter((range) => text.slice(range.start, range.end).trim().length > 0);
}

type IntlSegment = {
  index: number;
  segment: string;
};

type IntlSegmenterLike = {
  segment(input: string): Iterable<IntlSegment>;
};

type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locale: string,
    options: { granularity: "sentence" },
  ) => IntlSegmenterLike;
};

function segmentTextRanges(text: string) {
  if (!text.trim()) {
    return [];
  }

  const segmentationText = normalizeTextForSentenceSegmentation(text);

  try {
    const Segmenter = (Intl as IntlWithSegmenter).Segmenter;
    if (typeof Intl !== "undefined" && Segmenter) {
      const locale = guessSentenceLocale(segmentationText);
      const segmenter = new Segmenter(locale, {
        granularity: "sentence",
      });
      const ranges = Array.from(segmenter.segment(segmentationText), (segment) => ({
        start: segment.index,
        end: segment.index + segment.segment.length,
      })).filter(
        (range) =>
          segmentationText.slice(range.start, range.end).trim().length > 0,
      );

      if (ranges.length > 0) {
        return ranges;
      }
    }
  } catch {
    // Fall back to the local rule set below.
  }

  const fallbackRanges = fallbackSegmentTextRanges(segmentationText);
  if (fallbackRanges.length > 0) {
    return fallbackRanges;
  }

  return [{ start: 0, end: segmentationText.length }];
}

function segmentLines(lines: Line[], mode: WritingMode): TextBlock[] {
  if (lines.length === 0) {
    return [];
  }

  const { text, units, outputMap } = buildReadingText(lines, mode);
  const ranges = segmentTextRanges(text);

  return ranges
    .map((range) => {
      const seenItems = new Set<number>();
      const items: GlyphItem[] = [];

      for (let position = range.start; position < range.end; position += 1) {
        const unitIndex = outputMap[position];
        if (unitIndex === undefined || unitIndex < 0) {
          continue;
        }

        const unit = units[unitIndex];
        if (!seenItems.has(unit.itemIndex)) {
          seenItems.add(unit.itemIndex);
          items.push(unit.item);
        }
      }

      return {
        items,
        text: text.slice(range.start, range.end).trim(),
      };
    })
    .filter((block) => block.items.length > 0 && Boolean(block.text));
}

function groupIntoParagraphsHorizontal(lines: Line[]): TextBlock[] {
  return segmentLines(lines, "horizontal");
}

function groupIntoParagraphsVertical(columns: Line[]): TextBlock[] {
  return segmentLines(columns, "vertical");
}

function buildParagraphText(block: TextBlock): { text: string; items: GlyphItem[] } {
  if (block.text) {
    return { text: normalizeExtractedText(block.text), items: block.items };
  }

  let text = "";

  for (const item of block.items) {
    if (text.length > 0 && !text.endsWith(" ")) {
      text += " ";
    }
    text += item.text;
  }

  return { text: normalizeExtractedText(text.trim()), items: block.items };
}

function buildParagraphRects(page: number, items: GlyphItem[]): { page: number; x: number; y: number; w: number; h: number }[] {
  const grouped = new Map<number, GlyphItem[]>();
  for (const item of items) {
    if (!grouped.has(item.lineId)) {
      grouped.set(item.lineId, []);
    }
    grouped.get(item.lineId)!.push(item);
  }

  const rects = Array.from(grouped.values()).map((lineItems) => {
    const minX = Math.min(...lineItems.map((item) => item.x));
    const minY = Math.min(...lineItems.map((item) => item.y));
    const maxX = Math.max(...lineItems.map((item) => item.x + item.w));
    const maxY = Math.max(...lineItems.map((item) => item.y + item.h));
    return {
      page,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  });

  return rects;
}

export type PageExtractionResult = {
  paragraphs: Paragraph[];
  watermarks: string[];
};

type GlyphExtractionOptions = {
  docId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
};

export function extractParagraphsFromGlyphs(
  glyphs: GlyphItem[],
  { docId, pageIndex, pageWidth, pageHeight }: GlyphExtractionOptions
): Paragraph[] {
  const mode = detectWritingMode(glyphs);
  const sourceGlyphs =
    mode === "vertical" ? filterVerticalMarginalia(glyphs, pageHeight) : glyphs;
  const paragraphs: Paragraph[] = [];
  const appendParagraphBlock = (block: TextBlock) => {
    const { text, items } = buildParagraphText(block);
    if (!text) return;

    const hash = hashString(text);
    const pid = `${docId}:p${pageIndex + 1}:${hash}`;
    paragraphs.push({
      pid,
      page: pageIndex + 1,
      source: text,
      status: "idle",
      rects: buildParagraphRects(pageIndex + 1, items),
    });
  };

  let leadingSupplementalBlocks: TextBlock[] = [];
  let mainSourceGlyphs = sourceGlyphs;

  if (mode === "vertical") {
    const verticalBodyGlyphs = sourceGlyphs.filter(isLikelyVerticalItem);
    const supplementalGlyphs = sourceGlyphs.filter(
      (item) => !isLikelyVerticalItem(item),
    );

    if (verticalBodyGlyphs.length > 0) {
      mainSourceGlyphs = verticalBodyGlyphs;
    }

    if (supplementalGlyphs.length > 0) {
      const supplementalBlocks = groupIntoParagraphsHorizontal(
        groupIntoHorizontalLines(supplementalGlyphs),
      );

      leadingSupplementalBlocks = supplementalBlocks.filter((block) => {
        const { text, items } = buildParagraphText(block);
        const top = Math.min(...items.map((item) => item.y));
        const left = Math.min(...items.map((item) => item.x));
        const right = Math.max(...items.map((item) => item.x + item.w));
        return (
          text.length <= 24 &&
          top < pageHeight * 0.22 &&
          right - left < pageWidth * 0.35
        );
      });

    }
  }

  leadingSupplementalBlocks.forEach(appendParagraphBlock);

  // For horizontal text, detect and handle multi-column layout
  if (mode === "horizontal") {
    const columnBoundaries = detectColumnBoundaries(mainSourceGlyphs, pageWidth);
    const numColumns = columnBoundaries.length - 1;

    if (numColumns > 1) {
      // Multi-column layout detected
      assignColumnsToItems(mainSourceGlyphs, columnBoundaries);
      const columnGroups = groupItemsByColumn(mainSourceGlyphs, numColumns);

      // Process each column separately, left to right
      for (const columnItems of columnGroups) {
        if (columnItems.length === 0) continue;

        const lines = groupIntoHorizontalLines(columnItems);
        const internalParagraphs = groupIntoParagraphsHorizontal(lines);

        for (const para of internalParagraphs) {
          appendParagraphBlock(para);
        }
      }

      return paragraphs;
    }
  }

  // Single column or vertical layout
  const lines =
    mode === "vertical"
      ? groupIntoVerticalColumns(mainSourceGlyphs)
      : groupIntoHorizontalLines(mainSourceGlyphs);
  const internalParagraphs =
    mode === "vertical"
      ? groupIntoParagraphsVertical(lines)
      : groupIntoParagraphsHorizontal(lines);

  for (const para of internalParagraphs) {
    appendParagraphBlock(para);
  }
  return paragraphs;
}

export async function extractPageParagraphs(
  page: PDFPageProxy,
  docId: string,
  pageIndex: number
): Promise<PageExtractionResult> {
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  const allGlyphs = await normalizeTextItems(page, 1);

  // Filter out watermarks
  const { content: glyphs, watermarks: watermarkItems } = filterWatermarks(allGlyphs);
  const watermarks = watermarkItems.map((item) => item.text);
  const paragraphs = extractParagraphsFromGlyphs(glyphs, {
    docId,
    pageIndex,
    pageWidth,
    pageHeight,
  });

  return { paragraphs, watermarks };
}
