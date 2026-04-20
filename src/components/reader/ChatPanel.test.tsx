import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../../App.css?raw";
import chatPanelSource from "./ChatPanel.tsx?raw";
import { ChatPanel } from "./ChatPanel";

describe("ChatPanel", () => {
  test("renders preset chips inside the empty chat content while the chat is empty", () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        isVisible={false}
        model="openrouter/test"
        getCurrentPageText={() => "Current page"}
        getSurroundingPagesText={() => "Nearby pages"}
      />
    );

    expect(html).toContain(
      '<div class="chat-empty"><p>Ask about this page or pick a prompt.</p><div class="chat-presets">'
    );
    expect(html).toContain("Summarize this page");
  });

  test("gates presets to the empty state and uses an icon-only clear action", () => {
    expect(chatPanelSource).toContain("messages.length === 0 ? (");
    expect(chatPanelSource).toContain('<div className="chat-empty">');
    expect(chatPanelSource).toContain('<div className="chat-presets">');
    expect(chatPanelSource).toContain('className="chat-header rail-pane-header"');
    expect(chatPanelSource).toContain('className="chat-title rail-pane-title-row"');
    expect(chatPanelSource).toContain('className="rail-pane-title"');
    expect(chatPanelSource).toContain('aria-label="Clear chat"');
    expect(chatPanelSource).toContain('title="Clear chat"');
    expect(chatPanelSource).toContain('className="btn btn-ghost btn-icon-only"');
  });

  test("uses a full-width rail separator, in-content empty-state chips, and aligned chat composer sizing", () => {
    const railHandleRule =
      appCss.match(/\.rail-resize-handle::before\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatEmptyRule = appCss.match(/\.chat-empty\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatPresetsRule = appCss.match(/\.chat-presets\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatInputRule = appCss.match(/\.chat-input\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatSendRule = appCss.match(/\.chat-send-btn\s*\{([^}]*)\}/)?.[1] ?? "";
    const railPaneHeaderRule = appCss.match(/\.rail-pane-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const railPaneTitleRule = appCss.match(/\.rail-pane-title\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(railHandleRule).toContain("width: 100%");
    expect(chatEmptyRule).toContain("flex-direction: column");
    expect(chatEmptyRule).toContain("gap: 12px");
    expect(railPaneHeaderRule).toContain("padding: 12px 16px");
    expect(railPaneHeaderRule).not.toContain("border-bottom");
    expect(railPaneTitleRule).toContain("font-size: var(--type-size-pane-title)");
    expect(railPaneTitleRule).toContain("font-weight: var(--type-weight-semibold)");
    expect(chatPresetsRule).not.toContain("border-bottom");
    expect(chatPresetsRule).toContain("justify-content: center");
    expect(chatPresetsRule).toContain("padding: 0");
    expect(chatInputRule).toContain("height: 44px");
    expect(chatInputRule).toContain("box-sizing: border-box");
    expect(chatSendRule).toContain("width: 44px");
    expect(chatSendRule).toContain("height: 44px");
  });
});
