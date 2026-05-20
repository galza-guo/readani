import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  FileType,
} from "../types";
import type { PdfZoomMode } from "../lib/readerLayout";
import {
  READER_PANEL_MIN_HEIGHTS,
  clampReaderColumnPairSizes,
  clampReaderRailSectionPairSizes,
  DEFAULT_READER_PANELS,
  didReaderRailBecomeVisible,
  getReaderColumnLayoutKey,
  getReaderColumnMinWidth,
  getReaderRailLayoutKey,
  getReaderWorkspaceMinHeight,
  getReaderWorkspaceMinWidth,
  getVisibleRailSections,
  getVisibleReaderColumns,
  resolveReaderColumnWeights,
  resolveReaderRailSectionWeights,
  toggleReaderPanel,
  type ReaderColumnKey,
  type ReaderColumnWeightsByLayout,
  type ReaderPanelKey,
  type ReaderRailSectionKey,
  type ReaderRailSectionWeightsByLayout,
} from "../lib/readerWorkspace";

export type ResizableLayoutResult = {
  readerPanels: typeof DEFAULT_READER_PANELS;
  setReaderPanels: React.Dispatch<React.SetStateAction<typeof DEFAULT_READER_PANELS>>;
  activeColumnResizeKey: string | null;
  activeRailResizeKey: string | null;
  visibleReaderColumns: ReaderColumnKey[];
  visibleRailSections: ReaderRailSectionKey[];
  currentColumnWeights: Partial<Record<ReaderColumnKey, number>>;
  currentRailSectionWeights: Partial<Record<ReaderRailSectionKey, number>>;
  workspaceMinWidth: number;
  workspaceMinHeight: number;
  setColumnElementRef: (key: ReaderColumnKey) => (el: HTMLElement | null) => void;
  setRailSectionElementRef: (key: ReaderRailSectionKey) => (el: HTMLElement | null) => void;
  getColumnStyle: (key: ReaderColumnKey) => CSSProperties;
  getRailSectionStyle: (key: ReaderRailSectionKey) => CSSProperties;
  handleColumnResizeStart: (
    leftKey: ReaderColumnKey,
    rightKey: ReaderColumnKey,
  ) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleRailResizeStart: (
    topKey: ReaderRailSectionKey,
    bottomKey: ReaderRailSectionKey,
  ) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  togglePanel: (panel: ReaderPanelKey) => void;
  readerShellRef: React.RefObject<HTMLDivElement | null>;
};

export function useResizableLayout(args: {
  initialReaderPanels?: typeof DEFAULT_READER_PANELS;
  currentFileType: FileType;
  pdfZoomMode: PdfZoomMode;
  setPdfZoomMode: React.Dispatch<React.SetStateAction<PdfZoomMode>>;
}): ResizableLayoutResult {
  const { initialReaderPanels, currentFileType, pdfZoomMode, setPdfZoomMode } = args;

  const [readerPanels, setReaderPanels] = useState(
    initialReaderPanels ?? DEFAULT_READER_PANELS,
  );
  const [readerColumnWeights, setReaderColumnWeights] =
    useState<ReaderColumnWeightsByLayout>({});
  const [readerRailSectionWeights, setReaderRailSectionWeights] =
    useState<ReaderRailSectionWeightsByLayout>({});
  const [activeColumnResizeKey, setActiveColumnResizeKey] = useState<
    string | null
  >(null);
  const [activeRailResizeKey, setActiveRailResizeKey] = useState<string | null>(
    null,
  );

  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Record<ReaderColumnKey, HTMLElement | null>>({
    navigation: null,
    original: null,
    rail: null,
  });
  const railSectionRefs = useRef<
    Record<ReaderRailSectionKey, HTMLElement | null>
  >({
    translation: null,
    chat: null,
  });
  const columnResizeRef = useRef<{
    pointerId: number;
    startX: number;
    leftColumn: ReaderColumnKey;
    rightColumn: ReaderColumnKey;
    leftSize: number;
    rightSize: number;
    visibleColumns: ReaderColumnKey[];
    layoutKey: string;
  } | null>(null);
  const railResizeRef = useRef<{
    pointerId: number;
    startY: number;
    topSection: ReaderRailSectionKey;
    bottomSection: ReaderRailSectionKey;
    topSize: number;
    bottomSize: number;
    visibleSections: ReaderRailSectionKey[];
    layoutKey: string;
  } | null>(null);
  const previousReaderPanelsRef = useRef(readerPanels);

  const visibleReaderColumns = useMemo(
    () => getVisibleReaderColumns(readerPanels),
    [readerPanels],
  );

  const visibleRailSections = useMemo(
    () => getVisibleRailSections(readerPanels),
    [readerPanels],
  );

  const currentColumnLayoutKey = useMemo(
    () => getReaderColumnLayoutKey(visibleReaderColumns),
    [visibleReaderColumns],
  );

  const currentRailLayoutKey = useMemo(
    () => getReaderRailLayoutKey(visibleRailSections),
    [visibleRailSections],
  );

  const currentColumnWeights = useMemo(
    () => resolveReaderColumnWeights(readerColumnWeights, visibleReaderColumns),
    [readerColumnWeights, visibleReaderColumns],
  );

  const currentRailSectionWeights = useMemo(
    () =>
      resolveReaderRailSectionWeights(
        readerRailSectionWeights,
        visibleRailSections,
      ),
    [readerRailSectionWeights, visibleRailSections],
  );

  const workspaceMinWidth = useMemo(
    () => getReaderWorkspaceMinWidth(readerPanels),
    [readerPanels],
  );

  const workspaceMinHeight = useMemo(
    () => getReaderWorkspaceMinHeight(readerPanels),
    [readerPanels],
  );

  const togglePanel = useCallback((panel: ReaderPanelKey) => {
    setReaderPanels((prev) => toggleReaderPanel(prev, panel));
  }, []);

  // Panel sync effect: reset PDF zoom to "fit-width" when rail becomes visible
  useEffect(() => {
    const previousPanels = previousReaderPanelsRef.current;
    previousReaderPanelsRef.current = readerPanels;

    if (
      currentFileType === "pdf" &&
      readerPanels.original &&
      pdfZoomMode !== "fit-width" &&
      didReaderRailBecomeVisible(previousPanels, readerPanels)
    ) {
      setPdfZoomMode("fit-width");
    }
  }, [currentFileType, pdfZoomMode, readerPanels]);

  const setColumnElementRef = useCallback(
    (column: ReaderColumnKey) => (element: HTMLElement | null) => {
      columnRefs.current[column] = element;
    },
    [],
  );

  const setRailSectionElementRef = useCallback(
    (section: ReaderRailSectionKey) => (element: HTMLElement | null) => {
      railSectionRefs.current[section] = element;
    },
    [],
  );

  const getColumnStyle = useCallback(
    (column: ReaderColumnKey): CSSProperties => {
      const isVisible = visibleReaderColumns.includes(column);

      if (!isVisible) {
        return {
          flex: "0 0 0px",
          width: 0,
          minWidth: 0,
        };
      }

      return {
        flex: `${currentColumnWeights[column] ?? 1} 1 0px`,
        minWidth: `${getReaderColumnMinWidth(column, readerPanels)}px`,
      };
    },
    [currentColumnWeights, readerPanels, visibleReaderColumns],
  );

  const getRailSectionStyle = useCallback(
    (section: ReaderRailSectionKey): CSSProperties => {
      const isVisible = visibleRailSections.includes(section);

      if (!isVisible) {
        return {
          flex: "0 0 0px",
          height: 0,
          minHeight: 0,
        };
      }

      if (visibleRailSections.length === 1) {
        return {
          flex: "1 1 0px",
          minHeight: `${READER_PANEL_MIN_HEIGHTS[section]}px`,
        };
      }

      return {
        flex: `${currentRailSectionWeights[section] ?? 1} 1 0px`,
        minHeight: `${READER_PANEL_MIN_HEIGHTS[section]}px`,
      };
    },
    [currentRailSectionWeights, visibleRailSections],
  );

  const handleColumnResizeStart = useCallback(
    (leftColumn: ReaderColumnKey, rightColumn: ReaderColumnKey) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const leftElement = columnRefs.current[leftColumn];
        const rightElement = columnRefs.current[rightColumn];
        if (!leftElement || !rightElement) {
          return;
        }

        event.preventDefault();
        columnResizeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          leftColumn,
          rightColumn,
          leftSize: Math.round(leftElement.getBoundingClientRect().width),
          rightSize: Math.round(rightElement.getBoundingClientRect().width),
          visibleColumns: visibleReaderColumns,
          layoutKey: currentColumnLayoutKey,
        };
        document.body.classList.add("is-resizing-split-x");
        setActiveColumnResizeKey(`${leftColumn}:${rightColumn}`);

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional here.
        }
      },
    [currentColumnLayoutKey, visibleReaderColumns],
  );

  useEffect(() => {
    if (!activeColumnResizeKey) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = columnResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const nextSizes = clampReaderColumnPairSizes({
        panels: readerPanels,
        leftColumn: resizeState.leftColumn,
        rightColumn: resizeState.rightColumn,
        leftSize: resizeState.leftSize,
        rightSize: resizeState.rightSize,
        delta: event.clientX - resizeState.startX,
      });

      setReaderColumnWeights((prev) => {
        const currentWeights = resolveReaderColumnWeights(
          prev,
          resizeState.visibleColumns,
        );

        return {
          ...prev,
          [resizeState.layoutKey]: {
            ...currentWeights,
            [resizeState.leftColumn]: nextSizes.leftSize,
            [resizeState.rightColumn]: nextSizes.rightSize,
          },
        };
      });
    };

    const finishPointerResize = (event: PointerEvent) => {
      const resizeState = columnResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      columnResizeRef.current = null;
      setActiveColumnResizeKey(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerResize);
    window.addEventListener("pointercancel", finishPointerResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerResize);
      window.removeEventListener("pointercancel", finishPointerResize);
      document.body.classList.remove("is-resizing-split-x");
    };
  }, [activeColumnResizeKey, readerPanels]);

  const handleRailResizeStart = useCallback(
    (topSection: ReaderRailSectionKey, bottomSection: ReaderRailSectionKey) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const topElement = railSectionRefs.current[topSection];
        const bottomElement = railSectionRefs.current[bottomSection];
        if (!topElement || !bottomElement) {
          return;
        }

        event.preventDefault();
        railResizeRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          topSection,
          bottomSection,
          topSize: Math.round(topElement.getBoundingClientRect().height),
          bottomSize: Math.round(bottomElement.getBoundingClientRect().height),
          visibleSections: visibleRailSections,
          layoutKey: currentRailLayoutKey,
        };
        document.body.classList.add("is-resizing-split-y");
        setActiveRailResizeKey(`${topSection}:${bottomSection}`);

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional here.
        }
      },
    [currentRailLayoutKey, visibleRailSections],
  );

  useEffect(() => {
    if (!activeRailResizeKey) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = railResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const nextSizes = clampReaderRailSectionPairSizes({
        topSection: resizeState.topSection,
        bottomSection: resizeState.bottomSection,
        topSize: resizeState.topSize,
        bottomSize: resizeState.bottomSize,
        delta: event.clientY - resizeState.startY,
      });

      setReaderRailSectionWeights((prev) => {
        const currentWeights = resolveReaderRailSectionWeights(
          prev,
          resizeState.visibleSections,
        );

        return {
          ...prev,
          [resizeState.layoutKey]: {
            ...currentWeights,
            [resizeState.topSection]: nextSizes.topSize,
            [resizeState.bottomSection]: nextSizes.bottomSize,
          },
        };
      });
    };

    const finishPointerResize = (event: PointerEvent) => {
      const resizeState = railResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      railResizeRef.current = null;
      setActiveRailResizeKey(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerResize);
    window.addEventListener("pointercancel", finishPointerResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerResize);
      window.removeEventListener("pointercancel", finishPointerResize);
      document.body.classList.remove("is-resizing-split-y");
    };
  }, [activeRailResizeKey]);

  return {
    readerPanels,
    setReaderPanels,
    activeColumnResizeKey,
    activeRailResizeKey,
    visibleReaderColumns,
    visibleRailSections,
    currentColumnWeights,
    currentRailSectionWeights,
    workspaceMinWidth,
    workspaceMinHeight,
    setColumnElementRef,
    setRailSectionElementRef,
    getColumnStyle,
    getRailSectionStyle,
    handleColumnResizeStart,
    handleRailResizeStart,
    togglePanel,
    readerShellRef,
  };
}