import { describe, expect, test } from "bun:test";
import appCss from "../App.css?raw";
import aboutDialogSource from "./AboutDialog.tsx?raw";
import releaseSource from "../lib/release.ts?raw";

describe("AboutDialog", () => {
  test("keeps the header minimal by omitting the logo and only rendering the title plus one-line description", () => {
    expect(aboutDialogSource).not.toContain('import appIcon');
    expect(aboutDialogSource).not.toContain('about-dialog-app-icon');
    expect(aboutDialogSource).toContain('className="about-dialog-hero-copy"');
    expect(aboutDialogSource).toContain('t("about.description")');
  });

  test("uses a plain stacked metadata layout without the old labeled left column or separator lines", () => {
    const metadataRule = appCss.match(/\.about-dialog-metadata\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(aboutDialogSource).not.toContain("<dt");
    expect(aboutDialogSource).not.toContain("<dd");
    expect(aboutDialogSource).not.toContain("type-label-caps");

    expect(metadataRule).not.toContain("border-top");
    expect(metadataRule).not.toContain("border-bottom");
    expect(metadataRule).not.toContain("grid-template-columns");
  });

  test("thanks Everett explicitly for the upstream PDFRead project", () => {
    expect(releaseSource).toContain("Everett");
    expect(releaseSource).toContain("PDFRead");
    expect(releaseSource).toContain("https://github.com/everettjf");
    expect(releaseSource).toContain("https://github.com/everettjf/PDFRead");
    expect(aboutDialogSource).toContain("READANI_UPSTREAM_AUTHOR_URL");
    expect(aboutDialogSource).toContain("READANI_UPSTREAM_REPO_URL");
  });

  test("adds a changelog reader link beside the version and replaces the old contact row with a mail icon beside the author", () => {
    expect(aboutDialogSource).toContain('t("about.changelog")');
    expect(aboutDialogSource).toContain("setChangelogOpen(true)");
    expect(aboutDialogSource).toContain("about-dialog-icon-link");
    expect(aboutDialogSource).toContain("mailto:");
    expect(aboutDialogSource).not.toContain("Contact");
    expect(aboutDialogSource).not.toContain("Created by");
    expect(aboutDialogSource).not.toContain("Built ");
    expect(aboutDialogSource).toContain("ChangelogDialog");
  });

  test("offers update actions in the footer with a built-in check and manual release fallback", () => {
    const actionsRule = appCss.match(/\.about-dialog-actions\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(aboutDialogSource).toContain("onCheckForUpdates");
    expect(aboutDialogSource).toContain("onOpenLatestRelease");
    expect(aboutDialogSource).toContain('className="about-dialog-actions"');
    expect(aboutDialogSource).toContain('t("about.checkForUpdate")');
    expect(aboutDialogSource).toContain('t("about.openLatestRelease")');
    expect(releaseSource).toContain("READANI_RELEASES_URL");
    expect(actionsRule).toContain("justify-content: center");
  });

  test("loads the version from the runtime app metadata with a fallback", () => {
    expect(releaseSource).toContain("getReadaniRuntimeVersion");
    expect(releaseSource).toContain('return await getTauriAppVersion()');
    expect(releaseSource).toContain("return READANI_VERSION");
    expect(aboutDialogSource).toContain("const [appVersion, setAppVersion] = useState(READANI_VERSION);");
    expect(aboutDialogSource).toContain("void getReadaniRuntimeVersion().then");
    expect(aboutDialogSource).toContain('t("about.version", { appVersion })');
  });

  test("styles the changelog as a wider scrollable reader instead of dumping raw markdown", () => {
    expect(appCss).toContain(".dialog-content-changelog");
    expect(appCss).toContain(".changelog-dialog-body");
    expect(appCss).toContain(".changelog-section-list");
    expect(appCss).toContain(".changelog-inline-code");
  });
});
