import * as Toolbar from "@radix-ui/react-toolbar";
import type { ReaderPanelKey, ReaderPanelsState } from "../../lib/readerWorkspace";
import { t } from "../../lib/i18n";

type PanelToggleGroupProps = {
  panels: ReaderPanelsState;
  onToggle: (panel: ReaderPanelKey) => void;
};

export function PanelToggleGroup({ panels, onToggle }: PanelToggleGroupProps) {
  const PANEL_CONTROLS: Array<{ key: ReaderPanelKey; label: string }> = [
    { key: "navigation", label: t("reader.panelNavigate") },
    { key: "original", label: t("reader.panelOriginal") },
    { key: "translation", label: t("reader.panelTranslate") },
    { key: "chat", label: t("reader.panelChat") },
  ];

  const visiblePanelCount = Object.values(panels).filter(Boolean).length;

  return (
    <div className="panel-toggle-group" role="group" aria-label={t("reader.panels")}>
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
            {panel.label}
          </Toolbar.Button>
        );
      })}
    </div>
  );
}
