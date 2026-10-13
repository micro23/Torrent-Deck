# Releases and automatic updates

Installed builds check public GitHub Releases on `micro23/Torrent-Deck`. Windows uses electron-updater with NSIS and the `latest.yml`, installer, and blockmap assets. After you approve a download, **Restart And Update** installs it silently and relaunches the app. macOS downloads the matching architecture ZIP and opens it so you can move the extracted app into Applications to replace Torrent-Deck. Signing and notarization depend on the configured release credentials, as described below. Linux packaging remains configured but is not included in these releases. Development builds skip production checks. The `--update-url` override retains the legacy JSON downloader for local tests.

Windows releases contain one NSIS installer and the `latest.yml` and blockmap metadata required for in-app updates. macOS releases contain a Universal ZIP that supports both Intel and Apple Silicon. With signing credentials, the ZIP is signed and notarized; without them, the workflow still builds and publishes an unsigned ZIP, which Gatekeeper may block as damaged. GitHub also adds source-code archives automatically. Existing installations using the old repository URL follow GitHub’s rename redirect; new release builds and update checks use `micro23/Torrent-Deck`.

Choose **Check for Updates** in Help or the Settings → General update card. The dialog displays the installed version and latest stable GitHub version, reports checking and error states, and offers **Download Update** when a newer version exists. On Windows, choose **Restart And Update** after download. On macOS, choose **Open Downloaded ZIP**, extract the app, and replace Torrent-Deck in Applications.

## Publish a release

Current installer policy (2.19.13 onward): always build and publish both the
Universal macOS ZIP and Windows NSIS installer with matching versions. Include
the Windows blockmap and `latest.yml` so both platforms stay up to date together.

1. Increase the version in `package.json`; synchronize `app/package.json` and `package-lock.json` too.
2. Commit the finished code and push a matching tag, for example `v2.19.1` for version `2.19.1`.
3. GitHub Actions runs Deluge tests and builds the Windows installer and update metadata. It also builds a Universal macOS ZIP. When the GitHub Actions secrets `MACOS_CSC_LINK` (base64 Developer ID Application `.p12`), `MACOS_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are configured, the ZIP is signed and notarized, then checked with Gatekeeper and stapler. Without those credentials, it builds the ZIP unsigned; Gatekeeper may report that downloaded app as damaged.
4. Review and publish the release. Keep the Universal macOS ZIP, plus the Windows NSIS installer, `latest.yml`, and blockmap; the updaters need them. An empty release or source-only tag cannot update installed apps.

Signed macOS releases are notarized by Apple; unsigned builds may be blocked by Gatekeeper. Installing an update remains a manual ZIP extraction and app replacement. Windows SmartScreen may warn about the unsigned installer; NSIS update metadata and SHA-512 asset verification are still enabled. Pull requests and manual workflow runs build artifacts without publishing releases.

The release repository must be publicly readable. No GitHub access token is embedded in the app. Drafts and prereleases are excluded from stable updates. A new release version must be higher than the installed version; downgrades are disabled.

## Validation

Run `npm run lint`, `npm run build`, and focused Deluge tests: `npm test -- --client deluge:2 --spec test/specs/standard/torrent-uploads.spec.ts --headless`.

CI defaults to Deluge 2 only. Do not run other client tests until explicitly requested. Cross-platform source and packaging configurations remain maintained. Native macOS and packaged Windows tests use a local Deluge JSON-RPC fixture to verify real file bytes through the picker, File menu, OS file-opening events, drag-and-drop, immediate list updates, and removal. The OS picker response and file-opening events are automated; Chromium supplies disk-backed dropped files. These checks do not physically operate Finder or Explorer or install a downloaded update. Separate Docker integration tests exercise a real Deluge daemon. Signed macOS release jobs verify Gatekeeper acceptance and notarization; unsigned builds cannot pass Gatekeeper. Windows SmartScreen prompts still require manual verification.

## Torrent-Deck identity

The repository and update feed are `micro23/Torrent-Deck`. The application, bundle ID, executable, installer names, and icons use Torrent-Deck from 2.19.0. Install Torrent-Deck once and launch it to migrate profiles and register .torrent files. See [file-opening instructions](file-associations.md).
