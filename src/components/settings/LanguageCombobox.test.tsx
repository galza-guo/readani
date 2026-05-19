import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageCombobox } from "./LanguageCombobox";

const languageComboboxSource = readFileSync(
  resolve(import.meta.dir, "LanguageCombobox.tsx"),
  "utf8"
);

describe("LanguageCombobox", () => {
  test("renders the selected language as a closed trigger button", () => {
    const html = renderToStaticMarkup(
      <LanguageCombobox
        id="default-language-select"
        onChange={() => {}}
        value={{ code: "zh-CN", label: "Chinese (Simplified)" }}
      />
    );

    expect(html).toContain('class="language-combobox-trigger"');
    expect(html).toContain("Chinese (Simplified)");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="combobox"');
  });

  test("supports custom trigger labels for specialized pickers", () => {
    const html = renderToStaticMarkup(
      <LanguageCombobox
        getOptionLabel={() => "Deutsch"}
        id="app-language-select"
        onChange={() => {}}
        value={{ code: "de", label: "German" }}
      />
    );

    expect(html).toContain("Deutsch");
    expect(html).not.toContain("German");
  });

  test("sizes the popover content flexibly while keeping it at least as wide as the trigger", () => {
    const appStyles = readFileSync(resolve(import.meta.dir, "..", "..", "App.css"), "utf8");

    expect(appStyles).toContain("min-width: min(var(--radix-popover-trigger-width), calc(100vw - 32px));");
    expect(appStyles).toContain("width: fit-content;");
    expect(appStyles).toContain("max-width: min(360px, calc(100vw - 32px));");
  });

  test("supports specialized popover sizing classes for picker-specific menus", () => {
    const appStyles = readFileSync(resolve(import.meta.dir, "..", "..", "App.css"), "utf8");

    expect(languageComboboxSource).toContain("contentClassName?: string;");
    expect(languageComboboxSource).toContain("triggerClassName?: string;");
    expect(languageComboboxSource).toContain("leadingContent?: ReactNode");
    expect(languageComboboxSource).toContain("searchable?: boolean;");
    expect(languageComboboxSource).toContain("shouldAutoScrollRef");
    expect(languageComboboxSource).toContain('className={`language-combobox-content ${contentClassName ?? ""}`.trim()}');
    expect(appStyles).toContain(".language-combobox-content-shortlist");
    expect(appStyles).toContain(".language-combobox-content-common-list");
    expect(appStyles).toContain("max-height: min(480px, var(--radix-popover-content-available-height));");
    expect(appStyles).toContain("max-height: min(420px, var(--radix-popover-content-available-height));");
    expect(appStyles).toContain("min-height: 0;");
    expect(appStyles).toContain("overflow: hidden;");
  });
});
