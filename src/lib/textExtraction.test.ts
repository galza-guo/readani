import { describe, expect, test } from "bun:test";
import type { GlyphItem } from "./textExtraction";
import { extractParagraphsFromGlyphs, filterWatermarks } from "./textExtraction";

function glyph(
  text: string,
  x: number,
  y: number,
  options: Partial<GlyphItem> = {}
): GlyphItem {
  return {
    text,
    x,
    y,
    w: 16,
    h: 16,
    lineId: -1,
    isVertical: false,
    columnIndex: 0,
    rotation: 0,
    direction: "ltr",
    styleVertical: false,
    ...options,
  };
}

function verticalGlyphs(text: string, x: number, startY: number) {
  return Array.from(text).map((char, index) =>
    glyph(char, x, startY + index * 18, {
      direction: "ttb",
      styleVertical: true,
      isVertical: true,
      w: 12,
      h: 12,
    }),
  );
}

describe("textExtraction", () => {
  test("reads vertical pages right to left while dropping header/footer noise", () => {
    const glyphs: GlyphItem[] = [
      glyph("115", 40, 20),
      glyph("海", 250, 20),
      glyph("峡", 270, 20),
      glyph("万", 290, 20),
      glyph("里", 310, 20),
      glyph("或", 520, 110, { direction: "ttb", styleVertical: true }),
      glyph("许", 520, 132, { direction: "ttb", styleVertical: true }),
      glyph("如", 520, 154, { direction: "ttb", styleVertical: true }),
      glyph("此", 520, 176, { direction: "ttb", styleVertical: true }),
      glyph("船", 480, 110, { direction: "ttb", styleVertical: true }),
      glyph("已", 480, 132, { direction: "ttb", styleVertical: true }),
      glyph("启", 480, 154, { direction: "ttb", styleVertical: true }),
      glyph("航", 480, 176, { direction: "ttb", styleVertical: true }),
    ];

    const paragraphs = extractParagraphsFromGlyphs(glyphs, {
      docId: "doc",
      pageIndex: 0,
      pageWidth: 600,
      pageHeight: 900,
    });

    expect(paragraphs.map((paragraph) => paragraph.source)).toEqual(["或许如此船已启航"]);
  });

  test("does not classify vertical body text as a watermark just because it is rotated", () => {
    const { content, watermarks } = filterWatermarks([
      glyph("縦", 520, 110, {
        isVertical: true,
        rotation: 90,
        direction: "ttb",
        styleVertical: true,
      }),
    ]);

    expect(content).toHaveLength(1);
    expect(watermarks).toHaveLength(0);
  });

  test("keeps closing quotes with the sentence they belong to", () => {
    const glyphs: GlyphItem[] = [
      ...verticalGlyphs("彼は「本当に行くの？」と聞いた。", 520, 110),
      ...verticalGlyphs("私は「はい！」と答えた。", 500, 110),
    ];

    const paragraphs = extractParagraphsFromGlyphs(glyphs, {
      docId: "doc",
      pageIndex: 0,
      pageWidth: 600,
      pageHeight: 900,
    });

    expect(paragraphs.map((paragraph) => paragraph.source)).toEqual([
      "彼は「本当に行くの？」",
      "と聞いた。",
      "私は「はい！」",
      "と答えた。",
    ]);
  });

  test("does not split on OCR periods used like a CJK separator", () => {
    const glyphs = verticalGlyphs("日本史と中国.琉球との接点を知ることに繫がろう。", 520, 110);

    const paragraphs = extractParagraphsFromGlyphs(glyphs, {
      docId: "doc",
      pageIndex: 0,
      pageWidth: 600,
      pageHeight: 900,
    });

    expect(paragraphs.map((paragraph) => paragraph.source)).toEqual([
      "日本史と中国・琉球との接点を知ることに繫がろう。",
    ]);
  });

  test("keeps a short horizontal heading separate from vertical body text", () => {
    const glyphs: GlyphItem[] = [
      glyph("はじめに", 180, 40, {
        w: 48,
        h: 16,
      }),
      ...verticalGlyphs("長期にわたる同じ一族による支配である。", 520, 110),
    ];

    const paragraphs = extractParagraphsFromGlyphs(glyphs, {
      docId: "doc",
      pageIndex: 0,
      pageWidth: 600,
      pageHeight: 900,
    });

    expect(paragraphs.map((paragraph) => paragraph.source)).toEqual([
      "はじめに",
      "長期にわたる同じ一族による支配である。",
    ]);
  });
});
