# AGENTS.md

## Project Summary
readani is a Tauri desktop PDF bilingual reader. The UI is a two-column layout: the left pane renders PDFs with pdf.js and highlight overlays, while the right pane contains controls plus sentence-level translations (Slate read-only) virtualized per page. Translations are fetched via the Rust backend from OpenRouter, with a local JSON cache.

## Tech Stack (Fixed)
- Tauri (Rust backend)
- Bun
- React + TypeScript
- Radix UI
- pdf.js
- Slate (read-only)
- OpenRouter
- Virtualization: react-virtuoso

## Core Data Models (Must Use)
Rect:
{
  page: number,
  x: number,
  y: number,
  w: number,
  h: number
}

Sentence:
{
  sid: string,
  page: number,
  source: string,
  translation?: string,
  status: "idle" | "loading" | "done" | "error",
  rects: Rect[]
}

PageDoc:
{
  page: number,
  sentences: Sentence[]
}

## Key Architecture Notes
- PDF rendering: `pdfjs-dist/legacy/build/pdf.mjs` + `pdf.worker.mjs?worker`.
- Text layer: `TextLayerBuilder` from `pdfjs-dist/web/pdf_viewer.mjs`.
- Sentence extraction: `src/lib/textExtraction.ts` (single-column heuristic).
- Right pane: `src/components/TranslationPane.tsx` (Slate read-only).
- Left pane: `src/components/PdfViewer.tsx` + `src/components/PdfPage.tsx`.
- Settings UI: Radix Dialog + Select in `src/App.tsx`.

## Translation Pipeline (Must Respect)
- Frontend never calls OpenRouter directly.
- Tauri command: `openrouterTranslate` (Rust: `openrouter_translate`).
- Request payload:
  - model, temperature
  - targetLanguage: { label, code }
  - sentences: [{ sid, text }]
- Output format: strict JSON array of `{ sid, translation }`.
- Backend retries once if JSON parse fails.
- Cache key must include: docId, sid, source text hash, model, targetLanguage.code.
- Cache file: `translation_cache.json` under app config dir.
- API key file: `openrouter_key.txt` under app config dir.

## UX Requirements
- UI language is English only.
- App layout is left/right: PDF on the left; translation pane + controls on the right.
- Right pane is a stacked layout: source on top, translation below.
- Hover/click on sentence highlights corresponding rects on PDF.
- Highlight uses semi-transparent rounded rectangles.
- Theme defaults to system preference; user can override in settings (system/light/dark).
- Translation mode:
  - window: current page ± radius
  - chunk: chunk size pages
- Debounce 400ms, concurrency 1, ignore stale responses.

## Commands
- Install: `bun install`
- Dev: `bun run tauri dev`
- Build: `bun run build`

## Files to Know
- Frontend entry: `src/App.tsx`
- Styles: `src/App.css`
- Types: `src/types.ts`
- Extraction: `src/lib/textExtraction.ts`
- PDF pages: `src/components/PdfPage.tsx`
- PDF list: `src/components/PdfViewer.tsx`
- Translations: `src/components/TranslationPane.tsx`
- Rust backend: `src-tauri/src/lib.rs`
- Tauri config: `src-tauri/tauri.conf.json`

## Cross-Repo References
- Shared AI gateway repo: `/Users/guolite/GitHub/PersonalSite`
- AI gateway setup doc: `/Users/guolite/GitHub/PersonalSite/docs/ai-gateway-setup.md`
- AI gateway client contract: `/Users/guolite/GitHub/PersonalSite/docs/contracts/ai-gateway-client-contract.md`
- AI gateway server contract: `/Users/guolite/GitHub/PersonalSite/docs/contracts/ai-gateway-server-client-contract.md`
- Official `readani` website lives inside that repo as a sub-site, not a separate product:
  - app routes: `/Users/guolite/GitHub/PersonalSite/app/readani`
  - shared site components: `/Users/guolite/GitHub/PersonalSite/components/readani`
  - static assets: `/Users/guolite/GitHub/PersonalSite/public/readani`

## Cross-Repo Change Policy
- From this repo, you are allowed to make changes in `/Users/guolite/GitHub/PersonalSite` when the work requires AI gateway or official website updates for `readani`.
- The AI gateway is shared with other apps, so treat it as shared infrastructure: do not make `readani`-specific changes that would break existing gateway behavior for other clients.
- Prefer additive or well-scoped changes in the shared gateway, and preserve existing contracts unless the task explicitly includes coordinated contract updates.
- You are also allowed to update the `readani` sub-site inside the PersonalSite repo when release, billing, gateway, or product messaging work requires website changes.

## Guardrails
- Do NOT add features outside the MVP spec.
- Do NOT store OpenRouter API keys in frontend.
- Do NOT bypass Rust for translation requests.
- Keep UI English-only; no i18n.
