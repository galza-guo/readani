import { describe, expect, test } from "bun:test";
import * as Toolbar from "@radix-ui/react-toolbar";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../../App.css?raw";
import { PanelToggleGroup } from "./PanelToggleGroup";

describe("PanelToggleGroup", () => {
  test("renders the four reader panel segments with active states", () => {
    const html = renderToStaticMarkup(
      <Toolbar.Root>
        <PanelToggleGroup
          panels={{
            navigation: true,
            original: true,
            translation: false,
            chat: false,
          }}
          onToggle={() => {}}
        />
      </Toolbar.Root>
    );

    expect(html).toContain('class="panel-toggle-group"');
    expect(html).toContain(">Navigate<");
    expect(html).toContain(">Original<");
    expect(html).toContain(">Translate<");
    expect(html).toContain(">Chat<");
    expect(html).toContain('class="panel-toggle-btn is-active"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  test("disables the last visible active segment", () => {
    const html = renderToStaticMarkup(
      <Toolbar.Root>
        <PanelToggleGroup
          panels={{
            navigation: false,
            original: true,
            translation: false,
            chat: false,
          }}
          onToggle={() => {}}
        />
      </Toolbar.Root>
    );

    expect(html).toMatch(
      /<button[^>]*class="panel-toggle-btn is-active"[^>]*disabled=""[^>]*>Original<\/button>/
    );
  });

  test("styles the active segment with subtle shadow but no inset outline", () => {
    const activeRule = appCss.match(/\.panel-toggle-btn\.is-active\s*\{([^}]*)\}/)?.[1] ?? "";
    const pressedRule =
      appCss.match(/\.panel-toggle-btn:active:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(activeRule).toContain("box-shadow");
    expect(activeRule).not.toContain("inset 0 0 0 1px");
    expect(activeRule).not.toContain("translateY");
    expect(pressedRule).toContain("box-shadow");
    expect(pressedRule).not.toContain("inset 0 0 0 1px");
    expect(pressedRule).not.toContain("translateY");
  });

  test("keeps the reader header flush with the shell background", () => {
    const headerRule = appCss.match(/\.app-header\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(headerRule).not.toContain("background");
    expect(headerRule).not.toContain("border-bottom");
  });

  test("pins the panel toggle row to the true horizontal center of the toolbar", () => {
    const headerRule = appCss.match(/\.app-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const leftRule = appCss.match(/\.header-left\s*\{([^}]*)\}/)?.[1] ?? "";
    const centerRule = appCss.match(/\.header-center\s*\{([^}]*)\}/)?.[1] ?? "";
    const rightRule = appCss.match(/\.header-right\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(headerRule).toContain("display: grid");
    expect(headerRule).toContain(
      "grid-template-columns: minmax(180px, 1fr) minmax(440px, 1.5fr) minmax(180px, 1fr)"
    );
    expect(leftRule).toContain("width: 100%");
    expect(leftRule).toContain("justify-content: flex-start");
    expect(centerRule).toContain("grid-column: 2");
    expect(centerRule).toContain("width: 100%");
    expect(centerRule).toContain("justify-content: center");
    expect(rightRule).toContain("width: 100%");
    expect(rightRule).toContain("justify-content: flex-end");
  });
});
