# Release Channel Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a small build-channel foundation so GitHub builds stay free/BYOK-only and App Store builds can later enable StoreKit, paid gateway access, and App Store-only restrictions.

**Architecture:** Introduce one shared channel value, exposed in frontend code through Vite constants and in Rust code through a tiny runtime command. Use that value first to gate updater behavior, because App Store builds must not expose the direct-download updater. Keep the change intentionally small: no StoreKit, no gateway, and no paid UI yet.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vite, Bun tests.

---

### Task 1: Add Frontend Build Channel Constants

**Files:**
- Modify: `vite.config.ts`
- Create: `src/lib/buildChannel.ts`
- Test: `src/lib/buildChannel.test.ts`

**Step 1: Write the failing test**

Create `src/lib/buildChannel.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import buildChannelSource from "./buildChannel.ts?raw";
import viteConfigSource from "../../vite.config.ts?raw";

describe("build channel", () => {
  test("defaults to the GitHub free BYOK channel", () => {
    expect(buildChannelSource).toContain('export const READANI_BUILD_CHANNEL = __READANI_BUILD_CHANNEL__');
    expect(viteConfigSource).toContain('process.env.READANI_BUILD_CHANNEL ?? "github"');
  });

  test("derives paid and updater capability flags from the channel", () => {
    expect(buildChannelSource).toContain('READANI_BUILD_CHANNEL === "appstore"');
    expect(buildChannelSource).toContain("READANI_MANAGED_GATEWAY_ENABLED");
    expect(buildChannelSource).toContain("READANI_APP_UPDATES_ENABLED");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test src/lib/buildChannel.test.ts
```

Expected: FAIL because `src/lib/buildChannel.ts` does not exist yet.

**Step 3: Add Vite define**

Modify `vite.config.ts`:

```ts
// @ts-expect-error process is a nodejs global
const buildChannel = process.env.READANI_BUILD_CHANNEL ?? "github";
```

Add this inside `define`:

```ts
__READANI_BUILD_CHANNEL__: JSON.stringify(buildChannel),
```

**Step 4: Add frontend build-channel module**

Create `src/lib/buildChannel.ts`:

```ts
export type ReadaniBuildChannel = "github" | "appstore";

declare const __READANI_BUILD_CHANNEL__: ReadaniBuildChannel;

export const READANI_BUILD_CHANNEL = __READANI_BUILD_CHANNEL__;

export const READANI_IS_APP_STORE_BUILD = READANI_BUILD_CHANNEL === "appstore";
export const READANI_IS_GITHUB_BUILD = READANI_BUILD_CHANNEL === "github";

export const READANI_APP_UPDATES_ENABLED = READANI_IS_GITHUB_BUILD;
export const READANI_MANAGED_GATEWAY_ENABLED = READANI_IS_APP_STORE_BUILD;
export const READANI_SUBSCRIPTIONS_ENABLED = READANI_IS_APP_STORE_BUILD;
```

**Step 5: Run test to verify it passes**

Run:

```bash
bun test src/lib/buildChannel.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add vite.config.ts src/lib/buildChannel.ts src/lib/buildChannel.test.ts
git commit -m "feat: add release build channel constants"
```

---

### Task 2: Gate Frontend Updater UI By Channel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AboutDialog.test.tsx`

**Step 1: Write the failing test**

Update the existing About dialog updater test in `src/components/AboutDialog.test.tsx`:

```ts
import appSource from "../App.tsx?raw";
```

Add:

```ts
test("uses the build channel to hide direct-download updater UI in App Store builds", () => {
  expect(appSource).toContain("READANI_APP_UPDATES_ENABLED");
  expect(appSource).toContain("enabled: READANI_APP_UPDATES_ENABLED");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test src/components/AboutDialog.test.tsx
```

Expected: FAIL if `App.tsx` still uses the older updater constant or has no build-channel import.

**Step 3: Wire the channel constant into App**

Modify `src/App.tsx`:

```ts
import { READANI_APP_UPDATES_ENABLED } from "./lib/buildChannel";
```

Make sure the updater hook uses:

```ts
const updates = useAppUpdates({
  enabled: READANI_APP_UPDATES_ENABLED,
  showToast,
});
```

Remove or replace any old local `APP_UPDATES_ENABLED` constant if present.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test src/components/AboutDialog.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/components/AboutDialog.test.tsx
git commit -m "feat: gate updater UI by release channel"
```

---

### Task 3: Add Rust Build Channel Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add a Rust unit test**

Add near the bottom of `src-tauri/src/lib.rs`, before `run()` or inside the existing test module if there is one:

```rust
#[cfg(test)]
mod build_channel_tests {
    use super::*;

    #[test]
    fn build_channel_defaults_to_github() {
        assert_eq!(readani_build_channel(), "github");
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test build_channel_tests::build_channel_defaults_to_github
```

Expected: FAIL because `readani_build_channel` does not exist yet.

**Step 3: Add the command**

Add to `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
fn readani_build_channel() -> &'static str {
    option_env!("READANI_BUILD_CHANNEL").unwrap_or("github")
}
```

Add `readani_build_channel` to the `tauri::generate_handler![...]` list.

**Step 4: Run test to verify it passes**

Run:

```bash
cd src-tauri && cargo test build_channel_tests::build_channel_defaults_to_github
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: expose rust release build channel"
```

---

### Task 4: Keep App Store Builds From Registering The Updater Plugin

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.appstore.conf.json`
- Test: `src-tauri/src/lib.rs`

**Step 1: Write the failing test**

Add to the Rust test module:

```rust
#[test]
fn appstore_channel_disables_direct_download_updater() {
    assert!(!direct_download_updater_enabled_for_channel("appstore"));
    assert!(direct_download_updater_enabled_for_channel("github"));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test appstore_channel_disables_direct_download_updater
```

Expected: FAIL because the helper does not exist.

**Step 3: Add helper and use it during plugin registration**

Add:

```rust
fn direct_download_updater_enabled_for_channel(channel: &str) -> bool {
    channel != "appstore"
}
```

Change updater registration in `run()`:

```rust
#[cfg(desktop)]
{
    builder = builder.plugin(tauri_plugin_process::init());

    if direct_download_updater_enabled_for_channel(readani_build_channel()) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
}
```

**Step 4: Make the App Store config declare the channel**

If Tauri supports environment injection in the local build script, set `READANI_BUILD_CHANNEL=appstore` in `build-pkg.sh` instead of duplicating it in config. Otherwise document the required environment variable near the App Store build command in `docs/release.md`.

Do not remove updater dependencies yet; this task only stops registering the updater in App Store runtime.

**Step 5: Run tests**

Run:

```bash
cd src-tauri && cargo test appstore_channel_disables_direct_download_updater
bun test src/lib/buildChannel.test.ts src/components/AboutDialog.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.appstore.conf.json docs/release.md
git commit -m "feat: disable updater in app store channel"
```

---

### Task 5: Document Release Commands

**Files:**
- Modify: `docs/release.md`
- Modify: `docs/TODO.md`

**Step 1: Update docs**

In `docs/release.md`, add build-channel examples:

```bash
# GitHub/free BYOK build
READANI_BUILD_CHANNEL=github bun run tauri build

# App Store/commercial build
READANI_BUILD_CHANNEL=appstore ./build-pkg.sh
```

Explain in plain English:

- `github` means free BYOK build, updater allowed, no subscription or managed gateway UI.
- `appstore` means paid App Store build, updater disabled, StoreKit and managed gateway can be enabled in later tasks.

In `docs/TODO.md`, mark the lane decision as done or add a note that the implementation foundation exists.

**Step 2: Run docs grep**

Run:

```bash
rg -n "READANI_BUILD_CHANNEL|BYOK-only|App Store" docs/release.md docs/TODO.md
```

Expected: output includes both release lanes and the build-channel commands.

**Step 3: Commit**

```bash
git add docs/release.md docs/TODO.md
git commit -m "docs: document release build channels"
```

---

### Task 6: Final Verification

**Files:**
- No file changes expected.

**Step 1: Run frontend checks**

Run:

```bash
bun test src/lib/buildChannel.test.ts src/components/AboutDialog.test.tsx
bun run build
```

Expected: PASS.

**Step 2: Run Rust checks**

Run:

```bash
cd src-tauri && cargo test build_channel_tests
```

Expected: PASS.

**Step 3: Manual smoke check**

Run the GitHub lane:

```bash
READANI_BUILD_CHANNEL=github bun run tauri dev
```

Expected: About dialog still shows update controls.

Run the App Store lane:

```bash
READANI_BUILD_CHANNEL=appstore bun run tauri dev
```

Expected: About dialog hides update controls.

**Step 4: Commit any final fixes**

```bash
git status --short
git add <changed-files>
git commit -m "test: verify release channel foundation"
```
