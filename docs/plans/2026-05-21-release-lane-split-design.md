# Release Lane Split Design

## Decision

`readani` will keep two release lanes from the same codebase:

1. Mac App Store is the first official commercial release.
2. GitHub Releases remain available as a free BYOK-only direct-download lane.

In plain English: the App Store version is the paid product, while the GitHub version is a free build for users who bring their own translation API key.

## Goals

- Hold the official first release until Mac App Store, subscriptions, and managed gateway access are ready.
- Allow free GitHub builds whenever useful without blocking on billing or gateway work.
- Keep paid features out of free builds by using explicit build-channel gates.
- Preserve the option to revisit direct-download billing later without designing it into the first commercial release.

## Release Lanes

### Mac App Store

- Uses Apple-compliant packaging and signing.
- Disables the in-app updater because App Store updates are managed by Apple.
- Supports StoreKit subscriptions.
- Allows paid access to the proprietary `readani` AI gateway.
- Gates premium accent colors behind paid entitlement.
- Requires privacy disclosures and reviewer notes for document text sent to AI services.

### GitHub Free BYOK

- Produces direct-download installers such as `.dmg` and `.msi`.
- Supports BYOK providers only: OpenRouter, DeepSeek, and OpenAI-compatible presets.
- Does not show subscription UI.
- Does not use the proprietary `readani` gateway.
- May keep the direct-download updater path.

## Architecture

The app should expose a clear build-channel concept to both frontend and Rust code. The channel decides whether App Store-only or GitHub-only behavior is enabled.

- Shared reader core: PDF/EPUB reading, translation pane, BYOK provider settings, local cache, themes, annotations.
- App Store channel: StoreKit, paid entitlement status, managed gateway provider, premium accent colors, no updater.
- GitHub channel: BYOK-only providers, updater allowed, no paid entitlement surfaces.

## Data Flow

BYOK translation requests keep the existing flow:

1. Frontend sends translation work to the Tauri backend.
2. Rust backend calls the selected provider using the user-saved API key.
3. Results are cached locally.

Managed gateway requests use a separate paid flow:

1. Frontend selects the `readani` managed gateway provider.
2. Rust backend includes entitlement proof or a gateway-safe token.
3. The gateway verifies paid access before forwarding to upstream providers.
4. The app stores translations in the normal cache after success.

The desktop app must never embed upstream provider secrets.

## Error Handling

- GitHub builds should hide managed gateway controls entirely.
- App Store builds should show clear paywall and restore-purchase paths when entitlement is missing.
- Gateway entitlement failure should explain that managed AI requires an active subscription.
- BYOK provider failures should remain separate from subscription errors so users can understand which path failed.

## Testing

- Verify GitHub builds are BYOK-only and do not show subscription or managed gateway entry points.
- Verify App Store builds disable the updater.
- Verify purchase, restore, expired, canceled, and active subscription states.
- Verify paid entitlement is required before managed gateway requests succeed.
- Re-test core PDF and EPUB reading in both lanes.

## Next Decision

Choose the desktop gateway trust model:

1. Add a dedicated macOS / desktop client contract and app policy for `readani`.
2. Place a small trusted `readani` backend in front of the existing PersonalSite gateway.

The recommendation should be based on subscription verification, secret safety, operational simplicity, and whether future non-App-Store builds need managed AI.
