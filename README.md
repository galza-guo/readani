# readani

English | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="./screenshot.png" alt="readani screenshot" width="960" />
</p>

<p align="center">
  A desktop bilingual reader for PDFs and EPUBs, built for staying in the text with sentence-by-sentence translation close at hand.
</p>

<p align="center">
  <strong>v1.2.0</strong> · Tauri · React · TypeScript · pdf.js
</p>

## What It Is

`readani` keeps the original document on the left and the translation on the right, so you can read a foreign-language PDF or EPUB without constantly copying text into another tool.

Instead of giving you one large translated block, it works sentence by sentence, so it is easier to check meaning, names, and references without losing your place.

It is especially useful for research papers, essays, manuals, reports, and other documents where sentence-level context matters.

## Highlights

- Side-by-side reading layout for source and translation
- PDF-first reader with preserved EPUB support
- Sentence-by-sentence translation for more precise reading
- Source-page text selection for quick translation lookups
- Local cache for faster re-opens and repeat reads
- English-only desktop UI with light, dark, and system theme modes
- Translation requests handled by the Tauri/Rust backend, not the frontend
- Built-in presets for `OpenRouter`, `DeepSeek`, and generic `OpenAI-Compatible` endpoints

## Quick Start

### 1. Get the app

- Download a packaged build from the [GitHub Releases](https://github.com/galza-guo/readani/releases) page
- Open the app on your computer

### 2. Open a document

- Launch `readani`
- Open a PDF or EPUB
- Keep the PDF on the left and the translation pane on the right

### 3. Add a translation preset

- Open `Settings`
- Add a preset
- Choose a provider
- Paste your API key
- Load models or type a model name manually
- Save
- Click `Test`

## Provider Setup

### Option A: OpenRouter quick setup

This is the easiest general setup if OpenRouter is reachable from your network.

1. Create an account at [OpenRouter](https://openrouter.ai/).
2. Create an API key in the OpenRouter dashboard.
3. In `readani`, create a preset with:
   - Provider: `OpenRouter`
   - API key: your OpenRouter key
   - Model: `openrouter/free` for a quick free test, or another current model from OpenRouter
4. Save the preset and click `Test`.

Notes:

- OpenRouter also supports many `:free` model variants.
- OpenRouter's official FAQ says new users only get a very small free allowance, and free models have low rate limits, so they are good for testing but not ideal as a production default.

### Option B: DeepSeek quick setup

This is often the simplest alternative for mainland China users because `readani` has a built-in DeepSeek preset.

1. Create an account and API key from [DeepSeek API](https://platform.deepseek.com/).
2. In `readani`, create a preset with:
   - Provider: `DeepSeek`
   - API key: your DeepSeek key
   - Model: `deepseek-chat`
3. Save the preset and click `Test`.

The DeepSeek base URL is already built into the app as `https://api.deepseek.com`.

### Option C: OpenAI-compatible providers that are easier to access from mainland China

If OpenRouter is inconvenient, you can use `OpenAI-Compatible` with providers that expose an OpenAI-style Chat Completions API.

Common choices:

- [Alibaba Cloud Model Studio / DashScope](https://help.aliyun.com/zh/model-studio/get-api-key)
  - Base URL for mainland China (Beijing): `https://dashscope.aliyuncs.com/compatible-mode/v1`
- [SiliconFlow](https://docs.siliconflow.cn/en/api-reference/chat-completions/chat-completions)
  - Base URL: `https://api.siliconflow.cn/v1`

In `readani`, use:

- Provider: `OpenAI-Compatible`
- Base URL: the provider URL above
- API key: your provider key
- Model: click `Load models`, then pick a text/chat model from the provider's list

### Official provider docs

If you want the provider's own full instructions, use these links:

- OpenRouter docs: [API keys](https://openrouter.ai/docs/api-keys), [FAQ](https://openrouter.ai/docs/faq)
- DeepSeek docs: [DeepSeek API docs](https://api-docs.deepseek.com/)
- DashScope docs: [Get API key](https://help.aliyun.com/zh/model-studio/get-api-key), [OpenAI-compatible endpoint and regions](https://help.aliyun.com/zh/model-studio/regions/)
- SiliconFlow docs: [API reference](https://docs.siliconflow.cn/cn/api-reference), [Rate limits](https://docs.siliconflow.cn/en/userguide/rate-limits/rate-limit-and-upgradation)

## Which Provider Should I Use?

- Use `OpenRouter` if you want the easiest model switching and its website is accessible for you.
- Use `DeepSeek` if you want a simple built-in alternative with minimal setup.
- Use `OpenAI-Compatible` if you want to connect to China-friendly platforms such as DashScope or SiliconFlow.

## About Free Models and Public APIs

`readani` does not ship with a bundled public API key or a shared default translation service.

That is intentional:

- a shared public key would be easy to abuse
- rate limits would be unpredictable
- service quality could disappear without warning
- users would have no control over privacy, billing, or availability

For now, the most realistic "free to try" path is:

- `OpenRouter` with `openrouter/free`, or
- any provider that currently offers its own trial quota or promotional credits

If you need reliable daily use, plan on bringing your own API key.

## How It Works

### Reader layout

- Left: the original PDF or EPUB
- Right: translations, reading controls, and tools

### Translation flow

- The frontend never calls translation providers directly
- Translation requests go through the Tauri backend
- The backend stores settings and translation cache files under the app config directory
- Cached results can be reused when the same page and translation inputs match

### PDFs

- Uses `pdfjs-dist/legacy/build/pdf.mjs`
- Keeps a selectable text layer when the PDF has usable text
- Handles text-based PDFs and OCR-text PDFs best
- Image-only PDFs without usable text show a fallback instead of pretending the text exists

## Local Development

### Commands

If you are a normal reader, you do not need this section. These commands are only for developers running the app from source.

```bash
bun install
bun run tauri dev
```

```bash
bun run build
```

## Project Structure

- `src/App.tsx` - main app state, routing between home and reader, shared dialogs
- `src/views/HomeView.tsx` - landing view and recent-books entry point
- `src/components/PdfViewer.tsx` - PDF viewing shell
- `src/components/PdfPage.tsx` - PDF page rendering and selection layer
- `src/components/TranslationPane.tsx` - translation presentation
- `src/components/settings/SettingsDialogContent.tsx` - provider and translation settings UI
- `src/lib/textExtraction.ts` - PDF text extraction heuristics
- `src/lib/pageTranslationScheduler.ts` - queued translation flow
- `src-tauri/src/lib.rs` - Tauri commands and translation orchestration
- `src-tauri/src/providers.rs` - provider request shaping
- `src-tauri/src/page_cache.rs` - translation cache handling

## Product Notes

- UI copy is intentionally English-only
- Translation quality depends on the provider, model, and source document quality
- Cache identity depends on the document, source text, selected provider, model, and target language
- API keys stay in the app config area, not in the frontend bundle

## Tech Stack

- Tauri
- Rust
- React 19
- TypeScript
- Radix UI
- pdf.js
- Slate
- react-virtuoso

## Acknowledgements

- Created by Gallant GUO
- Contact: [glt@gallantguo.com](mailto:glt@gallantguo.com)
- Special thanks to [Everett (everettjf)](https://github.com/everettjf), author of [PDFRead](https://github.com/everettjf/PDFRead)

## License Notes

This repository includes bundled font assets with their own license text in [`src/assets/fonts/fira-sans-condensed/OFL.txt`](./src/assets/fonts/fira-sans-condensed/OFL.txt).
