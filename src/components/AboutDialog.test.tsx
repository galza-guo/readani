import { describe, expect, test } from "bun:test";
import appCss from "../App.css?raw";
import aboutDialogSource from "./AboutDialog.tsx?raw";
import releaseSource from "../lib/release.ts?raw";

describe("AboutDialog", () => {
  test("keeps the header minimal by omitting the logo and only rendering the title plus one-line description", () => {
    expect(aboutDialogSource).not.toContain('import appIcon');
    expect(aboutDialogSource).not.toContain('about-dialog-app-icon');
    expect(aboutDialogSource).toContain('className="about-dialog-hero-copy"');
    expect(aboutDialogSource).toContain("Bilingual PDF and EPUB reading for desktop.");
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
});
