import * as Toolbar from "@radix-ui/react-toolbar";
import type { ReaderPanelKey, ReaderPanelsState } from "../../lib/readerWorkspace";

const PANEL_CONTROLS: Array<{ key: ReaderPanelKey; label: string; shortLabel: string }> = [
  { key: "navigation", label: "Navigate", shortLabel: "Navigate" },
  { key: "original", label: "Original", shortLabel: "Original" },
  { key: "translation", label: "Translate", shortLabel: "Translate" },
  { key: "chat", label: "AI Chat", shortLabel: "Chat" },
];

type PanelToggleGroupProps = {
  panels: ReaderPanelsState;
  onToggle: (panel: ReaderPanelKey) => void;
};

export function PanelToggleGroup({ panels, onToggle }: PanelToggleGroupProps) {
  const visiblePanelCount = Object.values(panels).filter(Boolean).length;

  return (
    <div className="panel-toggle-group" role="group" aria-label="Reader panels">
      {PANEL_CONTROLS.map((panel) => {
        const isActive = panels[panel.key];
        const isLastVisible = isActive && visiblePanelCount === 1;

        return (
          <Toolbar.Button
            key={panel.key}
            className={`panel-toggle-btn ${isActive ? "is-active" : ""}`}
            aria-pressed={isActive}
            disabled={isLastVisible}
            onClick={() => onToggle(panel.key)}
            title={panel.label}
          >
            {panel.shortLabel}
          </Toolbar.Button>
        );
      })}
    </div>
  );
}
