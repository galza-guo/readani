import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readRepoFile(...segments: string[]) {
  return readFileSync(resolve(import.meta.dir, "..", "..", ...segments), "utf8");
}

describe("branding", () => {
  test("uses readani for app-facing branding and internal identifiers", () => {
    const packageJson = readRepoFile("package.json");
    const appSource = readRepoFile("src", "App.tsx");
    const defaultCapability = readRepoFile("src-tauri", "capabilities", "default.json");
    const homeView = readRepoFile("src", "views", "HomeView.tsx");
    const indexHtml = readRepoFile("index.html");
    const tauriConfig = readRepoFile("src-tauri", "tauri.conf.json");
    const cargoToml = readRepoFile("src-tauri", "Cargo.toml");
    const workerSource = readRepoFile("src", "lib", "pdfWorker.ts");
    const navigationPrefsSource = readRepoFile("src", "lib", "pdfNavigationPrefs.ts");

    expect(packageJson).toContain('"name": "readani"');
    expect(packageJson).toContain('"version": "1.3.0"');
    expect(appSource).toContain('const APP_WINDOW_TITLE = "readani"');
    expect(appSource).toContain("`${APP_WINDOW_TITLE} · ${trimmedBookTitle}`");
    expect(appSource).toContain("document.title = nextWindowTitle");
    expect(appSource).toContain('.setTitle(nextWindowTitle)');
    expect(defaultCapability).toContain('"core:window:allow-set-title"');

    expect(homeView).toContain('import readaniBannerForDarkTheme');
    expect(homeView).toContain('import readaniBannerForLightTheme');
    expect(homeView).toContain('className="home-logo-img home-logo-img--light"');
    expect(homeView).toContain('className="home-logo-img home-logo-img--dark"');
    expect(homeView).not.toContain('className="home-title"');
    expect(homeView).toContain("Language barriers removed.");
    expect(homeView).not.toContain("PDFRead");
    expect(homeView.indexOf('className="home-dropzone"')).toBeLessThan(
      homeView.indexOf('className="home-disclaimer"')
    );
    expect(homeView.indexOf('className="home-recent"')).toBeLessThan(
      homeView.indexOf('className="home-disclaimer"')
    );

    expect(indexHtml).toContain("<title>readani</title>");
    expect(indexHtml).toContain('href="/appicon.png"');
    expect(indexHtml).not.toContain("PDF Read");
    expect(indexHtml).not.toContain("/vite.svg");

    expect(tauriConfig).toContain('"productName": "readani"');
    expect(tauriConfig).toContain('"version": "1.3.0"');
    expect(tauriConfig).toContain(
      '"shortDescription": "Desktop bilingual PDF and EPUB reader for side-by-side translation."'
    );
    expect(tauriConfig).toContain('"identifier": "com.xnu.readani"');
    expect(tauriConfig).toContain('"title": "readani"');
    expect(tauriConfig).not.toContain("PDFRead");
    expect(tauriConfig).not.toContain("pdfread");

    expect(cargoToml).toContain('name = "readani"');
    expect(cargoToml).toContain('version = "1.3.0"');
    expect(cargoToml).toContain(
      'description = "Desktop bilingual PDF and EPUB reader for side-by-side translation."'
    );
    expect(cargoToml).toContain('authors = ["Gallant GUO <glt@gallantguo.com>"]');
    expect(cargoToml).toContain('name = "readani_lib"');
    expect(cargoToml).not.toContain("PDFRead");
    expect(cargoToml).not.toContain("pdfread");

    expect(workerSource).toContain("__readaniPdfJsWorker__");
    expect(workerSource).not.toContain("__readanyPdfJsWorker__");

    expect(navigationPrefsSource).toContain('"readani.pdfNav.tab"');
    expect(navigationPrefsSource).toContain('"readani.pdfNav.collapsed"');
    expect(navigationPrefsSource).toContain('"readani.pdfNav.sidebarWidth"');
    expect(navigationPrefsSource).toContain('"readani.pdfNav.leftPaneWidth"');
    expect(navigationPrefsSource).toContain('"readani.pdfNav.rightPaneWidth"');
  });
});
