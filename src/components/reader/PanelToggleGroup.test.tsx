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
    expect(html).toContain(">Nav<");
    expect(html).toContain(">Original<");
    expect(html).toContain(">Translation<");
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
});
