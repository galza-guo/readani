import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../../App.css?raw";
import { ExpandableIconButton } from "./ExpandableIconButton";

function DotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    </svg>
  );
}

describe("ExpandableIconButton", () => {
  test("renders the label before the icon when expanding to the left", () => {
    const html = renderToStaticMarkup(
      <ExpandableIconButton label="Settings" labelDirection="left" aria-label="Settings">
        <DotIcon />
      </ExpandableIconButton>
    );

    expect(html).toContain('class="btn btn-ghost expandable-icon-button"');
    expect(html).toContain('data-label-direction="left"');
    expect(html).toMatch(
      /expandable-icon-button__label[^>]*>Settings<\/span><span class="expandable-icon-button__icon"/
    );
  });

  test("renders the label after the icon when expanding to the right", () => {
    const html = renderToStaticMarkup(
      <ExpandableIconButton label="Home" labelDirection="right" aria-label="Home">
        <DotIcon />
      </ExpandableIconButton>
    );

    expect(html).toContain('data-label-direction="right"');
    expect(html).toMatch(
      /expandable-icon-button__icon[^>]*><svg[\s\S]*<\/svg><\/span><span class="expandable-icon-button__label"[^>]*>Home<\/span>/
    );
  });

  test("hides the label without reserving space until hover or focus", () => {
    const buttonRule = appCss.match(/\.expandable-icon-button\s*\{([^}]*)\}/)?.[1] ?? "";
    const labelRule = appCss.match(/\.expandable-icon-button__label\s*\{([^}]*)\}/)?.[1] ?? "";
    const revealRule =
      appCss.match(
        /\.expandable-icon-button:hover \.expandable-icon-button__label,\s*\.expandable-icon-button:focus-visible \.expandable-icon-button__label\s*\{([^}]*)\}/
      )?.[1] ?? "";

    expect(buttonRule).toContain("overflow: hidden");
    expect(buttonRule).toContain("min-width: 32px");
    expect(labelRule).toContain("max-width: 0");
    expect(labelRule).toContain("opacity: 0");
    expect(revealRule).toContain("max-width");
    expect(revealRule).toContain("opacity: 1");
  });

  test("keeps shared utility button hover and focus styles transparent and borderless", () => {
    const ghostHoverRule =
      appCss.match(/\.btn-ghost:hover,\s*\.btn-ghost:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    const quietHoverRule = appCss.match(/\.btn-quiet-action:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    const quietFocusRule = appCss.match(/\.btn-quiet-action:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    const quietDangerRule =
      appCss.match(
        /\.btn-quiet-action\.settings-icon-button-danger:hover,\s*\.btn-quiet-action\.settings-icon-button-danger:focus-visible\s*\{([^}]*)\}/
      )?.[1] ?? "";
    const darkHoverRule =
      appCss.match(
        /\[data-theme="dark"\] \.expandable-icon-button:hover,\s*\[data-theme="dark"\] \.expandable-icon-button:focus-visible\s*\{([^}]*)\}/
      )?.[1] ?? "";

    expect(ghostHoverRule).toContain("background: transparent");
    expect(ghostHoverRule).toContain("border-color: transparent");

    expect(quietHoverRule).toContain("background: transparent");
    expect(quietHoverRule).toContain("border-color: transparent");
    expect(quietHoverRule).toContain("color: var(--ink)");

    expect(quietFocusRule).toContain("border-color: transparent");
    expect(quietFocusRule).toContain("color: var(--ink)");
    expect(quietFocusRule).toContain("box-shadow: none");

    expect(quietDangerRule).toContain("color: var(--error)");
    expect(quietDangerRule).not.toContain("border-color");

    expect(darkHoverRule).toBe("");
  });
});
