import { describe, expect, test } from "bun:test";
import { chunkPageNumbers } from "./pdfExtractionQueue";

describe("pdf extraction queue", () => {
  test("chunks page numbers without changing order", () => {
    expect(chunkPageNumbers([34, 33, 35, 32, 36], 2)).toEqual([
      [34, 33],
      [35, 32],
      [36],
    ]);
  });

  test("returns no chunks for invalid sizes", () => {
    expect(chunkPageNumbers([1, 2, 3], 0)).toEqual([]);
  });
});
