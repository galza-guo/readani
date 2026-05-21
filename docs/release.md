# Release Guide

## Release Channels

`readani` has two separate macOS release lanes from the same codebase:

1. **Mac App Store (official commercial release)**  
   This is the first official paid release lane. It is blocked on StoreKit subscriptions, paid entitlement checks, managed `readani` AI gateway access, App Store packaging, and review readiness.

2. **GitHub Releases (free BYOK lane)**  
   This is the public direct-download path. It can ship whenever a free build is useful, but it stays BYOK-only:
   - Windows `.msi`
   - macOS `.dmg`
   - no subscription UI
   - no proprietary `readani` gateway access

In plain English: the Mac App Store build is the paid product launch, while the GitHub DMG is a free download for people who bring their own translation API key. The two lanes stay separate because Apple treats App Store packaging differently from direct downloads, and because the paid gateway must not leak into free builds by accident.

## GitHub Free Release Flow

GitHub Releases are allowed before the App Store release, but they are not the official paid launch. Use this lane only for free BYOK builds.

The tag-triggered workflow lives at [`.github/workflows/release.yml`](/Users/guolite/GitHub/ReadAny/.github/workflows/release.yml).

When you push a tag like `v1.0.1`, GitHub Actions will:

1. build a Windows installer (`.msi`) on `windows-latest`
2. build a macOS DMG on `macos-latest`
3. sign the macOS app with `Developer ID Application: Lite Guo (T96QFDVD9V)`
4. notarize the finished DMG with Apple `notarytool`
5. staple the notarization ticket to the DMG
6. upload the installers, updater signatures, and `latest.json` to the matching GitHub Release

The macOS build uses:

- main Tauri config: [`src-tauri/tauri.conf.json`](/Users/guolite/GitHub/ReadAny/src-tauri/tauri.conf.json)
- direct-download entitlements: [`src-tauri/Entitlements.plist`](/Users/guolite/GitHub/ReadAny/src-tauri/Entitlements.plist)
- local helper: [`build-dmg.sh`](/Users/guolite/GitHub/ReadAny/build-dmg.sh)
- notarization helper: [`scripts/notarize_dmg.sh`](/Users/guolite/GitHub/ReadAny/scripts/notarize_dmg.sh)
- updater manifest helper: [`scripts/generate_latest_json.py`](/Users/guolite/GitHub/ReadAny/scripts/generate_latest_json.py)

Plain-English detail: the workflow now keeps **signing** and **notarization** as two separate steps. That avoids Tauri trying to notarize too early during the app bundle phase, and instead lets Apple’s own notarization tool handle the final DMG in one explicit step.

Another small but important detail: Tauri cleans up its temporary `.app` bundle after it finishes creating the `.dmg`, so the workflow notarizes the finished DMG directly instead of trying to reuse that temporary app folder afterward.

Starting with `v1.1.0`, GitHub Releases also doubles as the app's update feed. The app checks:

`https://github.com/galza-guo/readani/releases/latest/download/latest.json`

That file points the app to the signed updater artifacts for Windows and macOS.

## Required GitHub Secrets

### macOS signing

These are required for the macOS DMG job:

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the **Developer ID Application** certificate and its private key |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting that `.p12` |

The workflow already hardcodes the team and signing identity for this repo:

- Team ID: `T96QFDVD9V`
- Signing identity: `Developer ID Application: Lite Guo (T96QFDVD9V)`

You do **not** need a separate GitHub secret for the team ID unless you decide to make the workflow more generic later.

### macOS notarization

Recommended option:

| Secret | What it is |
| --- | --- |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `APPLE_API_PRIVATE_KEY` | The full contents of `AuthKey_<KEY_ID>.p8` |

Fallback option:

| Secret | What it is |
| --- | --- |
| `APPLE_ID` | Apple account email |
| `APPLE_PASSWORD` | App-specific password for notarization |

The workflow supports either set. It prefers the API key route when present.

### Tauri updater signing

These are required for in-app updates:

| Secret | What it is |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The Tauri updater private key used to sign updater artifacts |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for that private key if you encrypted it |

Plain-English detail: this key is separate from your Apple certificate. Apple signing proves the app came from your Apple developer identity. The Tauri updater key lets the app verify that a downloaded update was published by you before installing it.

If your updater release build fails with `Wrong password for that key`, it means `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is missing or does not match the private key stored in `TAURI_SIGNING_PRIVATE_KEY`.

### GitHub token

No extra personal access token is required for releases. The built-in `GITHUB_TOKEN` is enough, as long as the workflow has `contents: write` permission. That permission is already set in the workflow file.

## Apple Assets You Need

### 1. Export the Developer ID certificate as `.p12`

On the Mac that already has this identity installed:

`Developer ID Application: Lite Guo (T96QFDVD9V)`

Do this:

1. Open **Keychain Access**
2. Find that certificate under **My Certificates**
3. Expand it and make sure the private key is there too
4. Right-click it and choose **Export**
5. Save it as a `.p12`
6. Pick an export password
7. Base64-encode the file and store that text in the `APPLE_CERTIFICATE` GitHub secret
8. Store the export password in `APPLE_CERTIFICATE_PASSWORD`

Example command for the Base64 step on macOS:

```bash
base64 -i DeveloperID-readani.p12 | pbcopy
```

### 2. Create notarization credentials

Recommended: create an **App Store Connect API key**.

Important plain-English detail: Apple’s docs say **individual App Store Connect API keys do not work with `notarytool`**. For notarization, use a team API key that you can use with `notarytool`.

After you download the `.p8` private key file:

1. copy the key ID into `APPLE_API_KEY`
2. copy the issuer ID into `APPLE_API_ISSUER`
3. copy the full `.p8` file contents into `APPLE_API_PRIVATE_KEY`

If you do not want to set up the API key yet, you can use the fallback `APPLE_ID` + `APPLE_PASSWORD` route for now.

## Free GitHub Release

Once the secrets are in place:

1. make sure the app version is updated consistently
2. commit and push the release commit
3. create a tag like `v1.0.1`
4. push the tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

That tag push starts the release workflow automatically. Before publishing, confirm the build is BYOK-only and does not expose the managed `readani` gateway or subscription UI.

For updater-enabled releases, the workflow publishes:

- Windows installer: `.msi`
- Windows updater signature: `.msi.sig`
- macOS installer: `.dmg`
- macOS updater archive: `.app.tar.gz`
- macOS updater signature: `.app.tar.gz.sig`
- updater manifest: `latest.json`

`v1.1.0` is the first public release that includes this updater feed. In plain English: users still install `v1.1.0` manually once, but after that the app can fetch later releases inside the app.

## Mac App Store Official Release Path

The App Store lane is deliberately separate:

- App Store config: [`src-tauri/tauri.appstore.conf.json`](/Users/guolite/GitHub/ReadAny/src-tauri/tauri.appstore.conf.json)
- App Store entitlements: [`src-tauri/Entitlements.AppStore.plist`](/Users/guolite/GitHub/ReadAny/src-tauri/Entitlements.AppStore.plist)
- App Store build helper: [`build-pkg.sh`](/Users/guolite/GitHub/ReadAny/build-pkg.sh)

This lane is **not** used by the GitHub Release workflow.

This is the lane for the first official commercial release.

### What App Store builds need

For a future Mac App Store submission you will need:

1. an **Apple Distribution** certificate for signing the `.app`
2. a **Mac App Store Connect** provisioning profile for `com.xnu.readani`
3. a **Mac Installer Distribution** certificate for signing the `.pkg`
4. App Store Connect upload credentials

Place the provisioning profile at:

`src-tauri/readani.appstore.provisionprofile`

That file is ignored by git on purpose.

### Local App Store package build later

When those assets exist, you can build the App Store package locally like this:

```bash
export APPLE_SIGNING_IDENTITY="Apple Distribution: YOUR NAME (T96QFDVD9V)"
export APPLE_INSTALLER_SIGNING_IDENTITY="Mac Installer Distribution: YOUR NAME (T96QFDVD9V)"
./build-pkg.sh
```

That produces a signed `.pkg` for App Store submission.

## Audit Notes

The repo previously mixed old App Store-era signing values into the normal macOS build. Those old values were removed from the release path:

- `Feng Zhu`
- `YPV49M8592`
- old `3rd Party Mac Developer` identities
- old embedded provisioning profile tied to `pdfread`

That old provisioning profile was especially risky because it still belonged to the old team and old app name.
