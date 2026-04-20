import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  PDF_NAV_COLLAPSED_KEY,
  PDF_NAV_TAB_KEY,
  PDF_NAV_LEFT_PANE_WIDTH_KEY,
  PDF_NAV_RIGHT_PANE_WIDTH_KEY,
  PDF_NAV_SIDEBAR_WIDTH_KEY,
  loadPdfNavigationPrefs,
  savePdfNavigationPrefs,
} from "./pdfNavigationPrefs";

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function getDefaultPrefs() {
  return {
    tab: "thumbnails" as const,
    collapsed: false,
    sidebarWidth: 252,
    leftPaneWidth: 0,
    rightPaneWidth: 0,
  };
}

describe("pdfNavigationPrefs", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("returns default widths when none are stored", () => {
    expect(loadPdfNavigationPrefs()).toEqual(getDefaultPrefs());
  });

  test("persists saved width preferences", () => {
    savePdfNavigationPrefs({
      tab: "contents",
      collapsed: false,
      sidebarWidth: 300,
      leftPaneWidth: 640,
      rightPaneWidth: 560,
    });

    expect(localStorage.getItem(PDF_NAV_TAB_KEY)).toBe("contents");
    expect(localStorage.getItem(PDF_NAV_COLLAPSED_KEY)).toBe("false");
    expect(localStorage.getItem(PDF_NAV_SIDEBAR_WIDTH_KEY)).toBe("300");
    expect(localStorage.getItem(PDF_NAV_LEFT_PANE_WIDTH_KEY)).toBe("640");
    expect(localStorage.getItem(PDF_NAV_RIGHT_PANE_WIDTH_KEY)).toBe("560");
    expect(loadPdfNavigationPrefs()).toEqual({
      tab: "contents",
      collapsed: false,
      sidebarWidth: 300,
      leftPaneWidth: 640,
      rightPaneWidth: 560,
    });
  });

  test("migrates legacy readany storage keys to readani", () => {
    localStorage.setItem("readany.pdfNav.tab", "contents");
    localStorage.setItem("readany.pdfNav.collapsed", "true");
    localStorage.setItem("readany.pdfNav.sidebarWidth", "310");
    localStorage.setItem("readany.pdfNav.leftPaneWidth", "640");
    localStorage.setItem("readany.pdfNav.rightPaneWidth", "520");

    expect(loadPdfNavigationPrefs()).toEqual({
      tab: "contents",
      collapsed: true,
      sidebarWidth: 310,
      leftPaneWidth: 640,
      rightPaneWidth: 520,
    });

    expect(localStorage.getItem(PDF_NAV_TAB_KEY)).toBe("contents");
    expect(localStorage.getItem(PDF_NAV_COLLAPSED_KEY)).toBe("true");
    expect(localStorage.getItem(PDF_NAV_SIDEBAR_WIDTH_KEY)).toBe("310");
    expect(localStorage.getItem(PDF_NAV_LEFT_PANE_WIDTH_KEY)).toBe("640");
    expect(localStorage.getItem(PDF_NAV_RIGHT_PANE_WIDTH_KEY)).toBe("520");
    expect(localStorage.getItem("readany.pdfNav.tab")).toBeNull();
    expect(localStorage.getItem("readany.pdfNav.collapsed")).toBeNull();
  });

  test("falls back from blank stored width strings", () => {
    localStorage.setItem(PDF_NAV_SIDEBAR_WIDTH_KEY, " ");
    localStorage.setItem(PDF_NAV_LEFT_PANE_WIDTH_KEY, "");
    localStorage.setItem(PDF_NAV_RIGHT_PANE_WIDTH_KEY, "\t");

    expect(loadPdfNavigationPrefs()).toEqual(getDefaultPrefs());
  });

  test("falls back from other invalid stored width values", () => {
    localStorage.setItem(PDF_NAV_SIDEBAR_WIDTH_KEY, "abc");
    localStorage.setItem(PDF_NAV_LEFT_PANE_WIDTH_KEY, "-1");
    localStorage.setItem(PDF_NAV_RIGHT_PANE_WIDTH_KEY, "1.5");

    expect(loadPdfNavigationPrefs()).toEqual(getDefaultPrefs());
  });

  test("falls back from infinity stored width values", () => {
    localStorage.setItem(PDF_NAV_SIDEBAR_WIDTH_KEY, "Infinity");

    expect(loadPdfNavigationPrefs()).toEqual(getDefaultPrefs());
  });
});
