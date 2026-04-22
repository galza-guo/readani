import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import homeViewSource from "./HomeView.tsx?raw";
import { HomeView } from "./HomeView";

describe("HomeView layout", () => {
  test("uses root-height layout primitives to avoid phantom window scrollbars", () => {
    const rootRule = appCss.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? "";
    const homeRule = appCss.match(/\.home\s*\{([^}]*)\}/)?.[1] ?? "";
    const mainRule = appCss.match(/\.home-main\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellRule = appCss.match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootRule).toContain("height: 100%");
    expect(rootRule).toContain("overflow: hidden");

    expect(homeRule).toContain("height: 100%");
    expect(homeRule).toContain("min-height: 0");
    expect(homeRule).not.toContain("height: 100vh");

    expect(mainRule).toContain("min-height: 0");
    expect(shellRule).toContain("height: 100%");
    expect(shellRule).not.toContain("height: 100vh");
  });

  test("styles the landing hero around the enlarged wordmark and footer fine print", () => {
    const contentRule = appCss.match(/\.home-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const logoWrapRule = appCss.match(/\.home-logo\s*\{([^}]*)\}/)?.[1] ?? "";
    const logoRule = appCss.match(/\.home-logo-img\s*\{([^}]*)\}/)?.[1] ?? "";
    const logoDarkRule = appCss.match(/\.home-logo-img--dark\s*\{([^}]*)\}/)?.[1] ?? "";
    const darkThemeLightLogoRule =
      appCss.match(/\[data-theme="dark"\]\s*\.home-logo-img--light\s*\{([^}]*)\}/)?.[1] ?? "";
    const darkThemeDarkLogoRule =
      appCss.match(/\[data-theme="dark"\]\s*\.home-logo-img--dark\s*\{([^}]*)\}/)?.[1] ?? "";
    const subtitleRule = appCss.match(/\.home-subtitle\s*\{([^}]*)\}/)?.[1] ?? "";
    const shortcutRule = appCss.match(/\.home-dropzone-shortcut\s*\{([^}]*)\}/)?.[1] ?? "";
    const disclaimerRule = appCss.match(/\.home-disclaimer\s*\{([^}]*)\}/)?.[1] ?? "";
    const fileNameRule = appCss.match(/\.home-file-name\s*\{([^}]*)\}/)?.[1] ?? "";
    const sectionTitleRule = appCss.match(/\.type-section-title\s*\{([^}]*)\}/)?.[1] ?? "";
    const dialogTitleRule = appCss.match(/\.type-title-large\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(contentRule).toContain("display: flex");
    expect(contentRule).toContain("flex-direction: column");
    expect(contentRule).toContain("min-height: 100%");

    expect(logoWrapRule).toContain("width: min(100%, 280px)");
    expect(logoWrapRule).toContain("margin-bottom: 16px");

    expect(logoRule).toContain("width: 100%");
    expect(logoRule).toContain("height: auto");
    expect(logoDarkRule).toContain("display: none");
    expect(darkThemeLightLogoRule).toContain("display: none");
    expect(darkThemeDarkLogoRule).toContain("display: block");

    expect(subtitleRule).toContain("font-size: var(--type-size-title-large)");
    expect(subtitleRule).toContain("font-weight: var(--type-weight-regular)");
    expect(subtitleRule).toContain("letter-spacing: 0");

    expect(sectionTitleRule).toContain("font-size: var(--type-size-section-title)");
    expect(sectionTitleRule).toContain("font-weight: var(--type-weight-semibold)");
    expect(sectionTitleRule).not.toContain("text-transform");

    expect(dialogTitleRule).toContain("font-size: var(--type-size-title-large)");
    expect(dialogTitleRule).toContain("font-weight: var(--type-weight-semibold)");

    expect(fileNameRule).toContain("font-size: var(--type-size-label)");
    expect(fileNameRule).toContain("font-weight: 500");

    expect(shortcutRule).toContain("font-size: 11px");
    expect(shortcutRule).toContain("color: var(--ink-subtle)");
    expect(shortcutRule).not.toContain("background:");
    expect(shortcutRule).not.toContain("padding:");
    expect(shortcutRule).not.toContain("border-radius:");

    expect(disclaimerRule).toContain("margin-top: auto");
    expect(disclaimerRule).toContain("font-size: var(--type-size-meta)");
    expect(disclaimerRule).toContain("font-style: italic");
    expect(disclaimerRule).toContain("color: var(--ink-subtle)");
    expect(disclaimerRule).not.toContain("background:");
    expect(disclaimerRule).not.toContain("border:");
  });

  test("uses shared typography classes for home section titles", () => {
    expect(homeViewSource).toContain('className="home-dropzone-title type-section-title"');
    expect(homeViewSource).toContain('className="home-recent-title type-section-title"');
  });

  test("renders theme-specific light and dark home banners", () => {
    expect(homeViewSource).toContain('import readaniBannerForDarkTheme');
    expect(homeViewSource).toContain('import readaniBannerForLightTheme');
    expect(homeViewSource).toContain('className="home-logo"');
    expect(homeViewSource).toContain('className="home-logo-img home-logo-img--light"');
    expect(homeViewSource).toContain('className="home-logo-img home-logo-img--dark"');
    expect(homeViewSource).not.toContain('import appIcon');
  });

  test("matches the reader header's expanding theme and settings buttons", () => {
    expect(homeViewSource).toContain("showHoverLabel={true}");
    expect(homeViewSource).toContain('labelDirection="left"');
    expect(homeViewSource).toContain("ExpandableIconButton");
    expect(homeViewSource).toContain("UpdateActionButton");
    expect(homeViewSource).toContain("showUpdateAction");
    expect(homeViewSource).toContain("onInstallUpdate");
    expect(homeViewSource).toContain('label="About"');
    expect(homeViewSource).toContain("onOpenAbout");
    expect(homeViewSource).toContain("onClick={onOpenAbout}");
    expect(homeViewSource).toContain('label="Settings"');
    expect(homeViewSource).toContain("showTranslationSetupCallout");
    expect(homeViewSource).toContain('className="home-setup-callout"');
    expect(homeViewSource).not.toContain('className="home-settings-btn"');
  });

  test("delegates settings dialog ownership to app and only renders the trigger on home", () => {
    expect(homeViewSource).toContain("onOpenSettings");
    expect(homeViewSource).toContain("onClick={onOpenSettings}");
    expect(homeViewSource).not.toContain("* as Dialog");
    expect(homeViewSource).not.toContain("SettingsDialogContent");
    expect(homeViewSource).not.toContain("settings-dialog-header");
    expect(homeViewSource).not.toContain("<Dialog.Content");
  });

  test("renders a lightweight setup callout near the header tools when translation is not ready", () => {
    const html = renderToStaticMarkup(
      <HomeView
        onOpenBook={() => {}}
        onOpenFile={() => {}}
        onOpenAbout={() => {}}
        onOpenSettings={() => {}}
        showTranslationSetupCallout={true}
        theme="system"
        onThemeToggle={() => {}}
      />
    );

    expect(html).toContain("Translation is not set up yet.");
    expect(html).toContain("Open Settings to add a provider.");
  });
});
