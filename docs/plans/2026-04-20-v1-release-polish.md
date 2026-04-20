# v1.0.0 Release Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a release-ready `v1.0.0` pass with an About dialog on the home screen, aligned release metadata, a polished README, and a final cleanup audit.

**Architecture:** Reuse the existing home header action pattern and Radix dialog primitives so the About experience fits the app without introducing new UI systems. Inject build timestamp metadata through Vite, keep version data aligned across package and Tauri configs, and use focused source-based tests to lock the release shell in place.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Bun tests, Radix Dialog, existing app CSS

---

### Task 1: Add release-shell tests first

**Files:**
- Modify: `src/views/HomeView.test.tsx`
- Modify: `src/lib/branding.test.ts`

**Step 1: Write the failing test**

Add assertions that the home header includes an About trigger and that branding metadata is updated to `1.0.0`.

**Step 2: Run test to verify it fails**

Run: `bun test src/views/HomeView.test.tsx src/lib/branding.test.ts`
Expected: FAIL because the About trigger and `1.0.0` metadata are not present yet.

**Step 3: Write minimal implementation**

Update the app shell and metadata only enough to satisfy the tests.

**Step 4: Run test to verify it passes**

Run: `bun test src/views/HomeView.test.tsx src/lib/branding.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/views/HomeView.test.tsx src/lib/branding.test.ts
git commit -m "test: cover release about surface metadata"
```

### Task 2: Add About dialog and build metadata wiring

**Files:**
- Create: `src/components/AboutDialog.tsx`
- Create: `src/lib/release.ts`
- Modify: `src/views/HomeView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/vite-env.d.ts`
- Modify: `vite.config.ts`

**Step 1: Write the failing test**

Extend the existing source-based tests to look for the About trigger wiring and version/build metadata usage.

**Step 2: Run test to verify it fails**

Run: `bun test src/views/HomeView.test.tsx src/lib/branding.test.ts`
Expected: FAIL on the new About and metadata assertions.

**Step 3: Write minimal implementation**

Create the About dialog, pass open/close state from `App.tsx`, add build timestamp helpers, and style the modal to match the app.

**Step 4: Run test to verify it passes**

Run: `bun test src/views/HomeView.test.tsx src/lib/branding.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/AboutDialog.tsx src/lib/release.ts src/views/HomeView.tsx src/App.tsx src/App.css src/vite-env.d.ts vite.config.ts
git commit -m "feat: add release about dialog"
```

### Task 3: Align release metadata to v1.0.0

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write the failing test**

Use the branding test to assert `1.0.0` across the relevant metadata files.

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/branding.test.ts`
Expected: FAIL because metadata still reports `0.1.8`.

**Step 3: Write minimal implementation**

Promote the package, Tauri, and Cargo version strings to `1.0.0`.

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/branding.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: mark v1.0.0 release metadata"
```

### Task 4: Rewrite README for the release

**Files:**
- Modify: `README.md`

**Step 1: Write the failing test**

No automated test required; rely on content review because this is documentation-only.

**Step 2: Run test to verify it fails**

Skip automated red step for documentation-only changes.

**Step 3: Write minimal implementation**

Replace the README with a clearer GitHub-facing structure, accurate feature set, and release-ready setup instructions.

**Step 4: Run test to verify it passes**

Review the rendered Markdown source for structure, wording, and consistency with the app.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: rewrite release README"
```

### Task 5: Final audit and verification

**Files:**
- Modify: any small release-polish files discovered during audit

**Step 1: Write the failing test**

Add only targeted tests if the audit reveals a concrete behavior or metadata gap worth locking down.

**Step 2: Run test to verify it fails**

Run the relevant focused command if a new test is added.

**Step 3: Write minimal implementation**

Apply small cleanup fixes only within release scope.

**Step 4: Run test to verify it passes**

Run:
- `bun test src/views/HomeView.test.tsx src/lib/branding.test.ts`
- `bun test`
- `bun run build`

Expected: PASS for tests and successful production build.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: final release polish audit"
```
