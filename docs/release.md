# Release Guide

## Release Channels

`readani` now has two separate macOS release lanes from the same codebase:

1. **GitHub Releases (ship now)**  
   This is the public direct-download path. It produces:
   - Windows `.msi`
   - macOS `.dmg`

2. **Mac App Store (prepare now, ship later)**  
   This stays separate on purpose because Apple treats App Store packaging differently from direct downloads.

In plain English: a GitHub DMG is the version people download from the web, while a Mac App Store build goes through Apple’s store rules, provisioning profiles, and extra packaging steps.

## Current GitHub Release Flow

The tag-triggered workflow lives at [`.github/workflows/release.yml`](/Users/guolite/GitHub/ReadAny/.github/workflows/release.yml).

When you push a tag like `v1.0.1`, GitHub Actions will:

1. build a Windows installer (`.msi`) on `windows-latest`
2. build a macOS DMG on `macos-latest`
3. sign the macOS app with `Developer ID Application: Lite Guo (T96QFDVD9V)`
4. notarize the DMG
5. staple the notarization ticket to the DMG
6. upload both artifacts to the matching GitHub Release

The macOS build uses:

- main Tauri config: [`src-tauri/tauri.conf.json`](/Users/guolite/GitHub/ReadAny/src-tauri/tauri.conf.json)
- direct-download entitlements: [`src-tauri/Entitlements.plist`](/Users/guolite/GitHub/ReadAny/src-tauri/Entitlements.plist)
- local helper: [`build-dmg.sh`](/Users/guolite/GitHub/ReadAny/build-dmg.sh)
- notarization helper: [`scripts/notarize_dmg.sh`](/Users/guolite/GitHub/ReadAny/scripts/notarize_dmg.sh)

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

## First GitHub Release

Once the secrets are in place:

1. make sure the app version is updated consistently
2. commit and push the release commit
3. create a tag like `v1.0.1`
4. push the tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

That tag push starts the release workflow automatically.

## Future Mac App Store Path

The App Store lane is deliberately separate:

- App Store config: [`src-tauri/tauri.appstore.conf.json`](/Users/guolite/GitHub/ReadAny/src-tauri/tauri.appstore.conf.json)
- App Store entitlements: [`src-tauri/Entitlements.AppStore.plist`](/Users/guolite/GitHub/ReadAny/src-tauri/Entitlements.AppStore.plist)
- App Store build helper: [`build-pkg.sh`](/Users/guolite/GitHub/ReadAny/build-pkg.sh)

This lane is **not** used by the GitHub Release workflow.

### What App Store builds need later

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
