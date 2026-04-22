import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import appCss from "./App.css?raw";
import settingsDialogContentSource from "./components/settings/SettingsDialogContent.tsx?raw";

function hasAsset(path: string) {
  return existsSync(resolve(import.meta.dir, path));
}

function getRule(pattern: RegExp) {
  return appCss.match(pattern)?.[1] ?? "";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("app typography font roles", () => {
  test("uses vendored Fira Sans Condensed for UI chrome and keeps reader content on the body stack", () => {
    const rootRule = normalizeWhitespace(getRule(/:root\s*\{([^}]*)\}/));
    const bodyRule = normalizeWhitespace(getRule(/(?:^|\n)body\s*\{([^}]*)\}/));
    const pageTranslationContentRule = getRule(
      /(?:^|\n)\.page-translation-content\s*\{([^}]*)\}/
    );
    const paragraphSourceRule = getRule(/(?:^|\n)\.paragraph-source\s*\{([^}]*)\}/);
    const paragraphTranslationRule = getRule(
      /(?:^|\n)\.paragraph-translation\s*\{([^}]*)\}/
    );
    const chatMessageContentRule = getRule(/(?:^|\n)\.chat-message-content\s*\{([^}]*)\}/);

    expect(appCss).not.toContain("fonts.googleapis.com");
    expect(appCss).toContain('@font-face');
    expect(appCss).toContain('font-family: "Fira Sans Condensed"');
    expect(normalizeWhitespace(appCss)).toContain(
      'url("./assets/fonts/fira-sans-condensed/FiraSansCondensed-Regular.ttf") format("truetype")'
    );
    expect(rootRule).toContain('--font-ui: "Fira Sans Condensed"');
    expect(rootRule).toContain("--font-body:");
    expect(bodyRule).toContain("font-family: var(--font-ui)");
    expect(pageTranslationContentRule).toContain("font-family: var(--font-body)");
    expect(paragraphSourceRule).toContain("font-family: var(--font-body)");
    expect(paragraphTranslationRule).toContain("font-family: var(--font-body)");
    expect(chatMessageContentRule).toContain("font-family: var(--font-body)");
  });

  test("vendors the local font files used by the UI typography stack", () => {
    expect(hasAsset("./assets/fonts/fira-sans-condensed/FiraSansCondensed-Regular.ttf")).toBe(
      true
    );
    expect(hasAsset("./assets/fonts/fira-sans-condensed/FiraSansCondensed-Italic.ttf")).toBe(true);
    expect(hasAsset("./assets/fonts/fira-sans-condensed/FiraSansCondensed-Medium.ttf")).toBe(true);
    expect(hasAsset("./assets/fonts/fira-sans-condensed/FiraSansCondensed-SemiBold.ttf")).toBe(
      true
    );
    expect(hasAsset("./assets/fonts/fira-sans-condensed/FiraSansCondensed-Bold.ttf")).toBe(true);
    expect(hasAsset("./assets/fonts/fira-sans-condensed/OFL.txt")).toBe(true);
  });

  test("applies the UI font and slightly larger sizing to shared controls", () => {
    const rootRule = normalizeWhitespace(getRule(/:root\s*\{([^}]*)\}/));
    const controlRule = normalizeWhitespace(getRule(
      /button,\s*input,\s*select,\s*textarea\s*\{([^}]*)\}/
    ));
    const buttonRule = normalizeWhitespace(getRule(/(?:^|\n)\.btn\s*\{([^}]*)\}/));
    const smallButtonRule = normalizeWhitespace(getRule(/(?:^|\n)\.btn-small\s*\{([^}]*)\}/));
    const inputRule = normalizeWhitespace(getRule(/(?:^|\n)\.input\s*\{([^}]*)\}/));
    const selectTriggerRule = normalizeWhitespace(getRule(/(?:^|\n)\.select-trigger\s*\{([^}]*)\}/));
    const languageTriggerRule = normalizeWhitespace(getRule(
      /(?:^|\n)\.language-combobox-trigger\s*\{([^}]*)\}/
    ));
    const modelOptionRule = normalizeWhitespace(getRule(
      /(?:^|\n)\.model-combobox-option,\s*\.model-combobox-empty\s*\{([^}]*)\}/
    ));
    const settingsLanguageToggleRule = normalizeWhitespace(getRule(
      /(?:^|\n)\.settings-language-toggle\s*\{([^}]*)\}/
    ));
    const settingsTabTriggerRule = normalizeWhitespace(getRule(
      /(?:^|\n)\.settings-tab-trigger\s*\{([^}]*)\}/
    ));
    const statusRule = normalizeWhitespace(getRule(
      /(?:^|\n)\.settings-field-status,\s*\.settings-action-status\s*\{([^}]*)\}/
    ));

    expect(rootRule).toContain("--type-size-title-large: 19px");
    expect(rootRule).toContain("--type-size-pane-title: 16px");
    expect(rootRule).toContain("--type-size-section-title: 14px");
    expect(rootRule).toContain("--type-size-label: 14px");
    expect(rootRule).toContain("--type-size-body: 15px");
    expect(rootRule).toContain("--type-size-meta: 13px");
    expect(rootRule).toContain("--type-size-label-caps: 12px");
    expect(controlRule).toContain("font: inherit");
    expect(buttonRule).toContain("font-family: inherit");
    expect(buttonRule).toContain("font-size: var(--type-size-label)");
    expect(smallButtonRule).toContain("font-size: var(--type-size-meta)");
    expect(inputRule).toContain("font-family: inherit");
    expect(inputRule).toContain("font-size: var(--type-size-label)");
    expect(selectTriggerRule).toContain("font-family: inherit");
    expect(selectTriggerRule).toContain("font-size: var(--type-size-label)");
    expect(languageTriggerRule).toContain("font-family: inherit");
    expect(languageTriggerRule).toContain("font-size: var(--type-size-label)");
    expect(modelOptionRule).toContain("font-family: inherit");
    expect(modelOptionRule).toContain("font-size: var(--type-size-label)");
    expect(settingsLanguageToggleRule).toContain("font-family: inherit");
    expect(settingsLanguageToggleRule).toContain("font-size: var(--type-size-label)");
    expect(settingsTabTriggerRule).toContain("min-height: 36px");
    expect(settingsDialogContentSource).toContain('className="panel-toggle-btn settings-tab-trigger"');
    expect(statusRule).toContain("font-size: var(--type-size-meta)");
  });

  test("nudges the specific small UI labels called out in settings, reader header, and toolbar toggles", () => {
    const settingsLabelRule = getRule(
      /(?:^|\n)\.settings-label\.type-field-label,\s*\.settings-toolbar-title\.type-section-title\s*\{([^}]*)\}/
    );
    const pageLabelRule = getRule(
      /(?:^|\n)\.document-page-label,\s*\.pdf-page-jump-label,\s*\.pdf-page-jump-total,\s*\.pdf-zoom-readout\s*\{([^}]*)\}/
    );
    const panelToggleRule = getRule(/(?:^|\n)\.panel-toggle-btn\s*\{([^}]*)\}/);

    expect(settingsLabelRule).toContain("font-size: 15px");
    expect(pageLabelRule).toContain("font-size: var(--type-size-label)");
    expect(panelToggleRule).toContain("font-size: var(--type-size-label)");
  });
});
