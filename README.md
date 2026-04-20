# readani

readani is a Tauri desktop bilingual reader for PDFs, with preserved EPUB support.

<p align="center">
  <img src="./screenshot.png" alt="readani Screenshot" width="860" />
</p>

## Why readani

Reading a PDF in another language is slow when you have to translate paragraph by paragraph. readani keeps the original page on the left and a readable translation of that same page on the right, so you can stay in flow while still checking the source.

## MVP Highlights

- PDF-first, single-page reading layout.
- Current page translation with next-page prefetch.
- Page-level local cache so reopened pages can return instantly.
- Hidden but selectable PDF text layer for text-based and OCR-text PDFs.
- Selection pop-up translation for words, phrases, or short sentences.
- Provider-ready backend with OpenRouter and OpenAI-compatible endpoint support.
- Manual model entry fallback when model listing is unavailable.
- EPUB support remains available through the existing flow.

## How It Works

- Left pane: one PDF page rendered with pdf.js.
- Right pane: one translated page for the same page number.
- Translation requests go through the Rust/Tauri backend, not directly from the frontend.
- The backend stores provider settings and page translations under the app config directory.
- Page cache keys include document, page, source hash, provider, model, language, and prompt version.

## Install (Homebrew)

```bash
brew update && brew tap everettjf/tap && brew install --cask readani
```

## Develop

```bash
bun install
bun run tauri dev
```

## Build

```bash
bun run build
```

## Usage

1. Open a PDF or EPUB.
2. Choose your provider, API credentials, model, and target language in Settings.
3. For PDFs, read one source page on the left and its translated page on the right.
4. Move pages with the toolbar or keyboard shortcuts:
   - `ArrowLeft` / `PageUp`
   - `ArrowRight` / `PageDown`
5. Select text on the PDF page to get a quick pop-up translation.

## PDF Notes

- Text-based PDFs and OCR-text PDFs work for page translation and selection.
- Image-only PDFs without usable text show an OCR-needed fallback message.
- Cached pages skip the typing animation and appear immediately when reopened.

## Settings

- Provider presets:
  - OpenRouter
  - OpenAI-compatible endpoint
- Model discovery when supported
- Manual model input fallback
- Target language
- Theme: system / light / dark

## Project Structure

- `src/App.tsx`: main app state and reader orchestration
- `src/components/PdfViewer.tsx`: single-page PDF viewer shell
- `src/components/PdfPage.tsx`: PDF page rendering and invisible text selection layer
- `src/components/TranslationPane.tsx`: page translation view and legacy EPUB translation pane
- `src/components/settings/SettingsDialogContent.tsx`: shared settings UI
- `src/lib/pageText.ts`: page translation payload helpers
- `src/lib/pageQueue.ts`: page navigation and prefetch helpers
- `src/lib/typewriter.ts`: translated text reveal helper
- `src-tauri/src/lib.rs`: Tauri commands and translation orchestration
- `src-tauri/src/providers.rs`: provider abstraction helpers
- `src-tauri/src/page_cache.rs`: page cache helpers

## Recommended IDE Setup

- VS Code + Tauri extension + rust-analyzer
