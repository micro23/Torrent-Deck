# Changes since the Electorrent fork

## 2.19.17 — consolidated master and upstream updates

- Merge the pending status bar, tracker logo/dashboard and right-side detail fixes into master.
- Integrate all eight upstream updates, including dependency refreshes and keeping headless upload windows hidden.
- Verify macOS app/helper signatures, runtime entitlements and both universal architectures inside the release ZIP.
- Build matching macOS and Windows installers, with ad-hoc macOS signing when Developer ID credentials are unavailable.

## 2.19.16 — visible right-side torrent details

- Anchor Darkhand's right-side details card to the main panel instead of a zero-height wrapper, so its tabs and content remain visible.
- Check Info, Files, Peers and Trackers while switching an open torrent between bottom and right placement.

## 2.19.15 — tracker logos and WebUI dashboard alignment

- Retry tracker site, recognized site root and cached favicons in the WebUI's order; show a neutral network symbol only if every source fails.
- Prevent failed images from leaking Chromium's broken-image indicator through theme styling.
- Keep Darkhand statistics and chart captions above the fixed footer, and size short torrent tables to their contents.
- Match the WebUI's outline statistics icons, horizontal card layout, transfer-limit captions, active counts and clock labels.

## 2.19.14 — WebUI session status bar

- Match the Deluge Deck footer across all 38 themes: free-space badge, live sync state, DHT nodes, transfer rates and server public IP.
- Restore the shared theme styling for footer badges and sync indicators, including Terminal's text display.
- Keep Darkhand's sidebar above its full-width footer so it cannot cover session status.
- Preserve Deluge login cookies when the computer clock differs from the server.

## 2.19.13 — Deluge response and tracker reliability

- Reject malformed Deluge replies and snapshots instead of reporting false success or clearing the torrent list.
- Preserve unavailable disk-space values as unknown and retain tracker tier zero during edits.
- Wait for tracker sorting to render in the integration test.
- Validate all 24 Deluge suites (145 passing cases), 35 regression tests, and five native macOS file workflows.
- Publish the universal macOS ZIP and Windows installer together, with Windows updater metadata.

## 2.19.12 — Mac and Windows torrent workflow reliability

- Preserve dropped torrent files before the browser clears its drag data, including Option on macOS and Ctrl on Windows to show upload options.
- Report unreadable dropped files and continue adding valid files from the same drop.
- Keep toolbar dropdowns above the torrent table header across themes and content sizes; use visible coordinates in scaled layout and resizing tests.
- Recover from malformed update responses and cancelled downloads; guard updater callbacks after the window closes and handle downloads without a known size.
- Download macOS updates again rather than trusting an existing file based only on its size.
- Check file picker, File menu, native file-opening events, drops, paused uploads, immediate list updates, and removal on macOS and the packaged Windows app in CI, using a local Deluge protocol fixture. Real Deluge integration tests continue separately.

## 2.19.6 — universal macOS and Windows release

- Build and publish the Universal macOS ZIP alongside the Windows installer.
- When signing credentials are unavailable, publish an unsigned macOS build and identify its Gatekeeper limitation.

## 2.19.5 — complete Deck theme refresh

- Refresh theme materials from Deluge Deck 1.0.95 and show authentic stadium photography in every sports-team masthead.
- Preserve Darkhand and Terminal styling.
- Publish the Windows installer now; universal macOS packages remain gated on signing and notarization credentials.

## 2.19.4 — Deluge Deck theme sync

- Sync the desktop theme materials and sports venue artwork with Deluge Deck 1.0.95.
- Refine Darkhand dashboard spacing while preserving Torrent-Deck's desktop controls and multi-client support.
- Require Developer ID signing and Apple notarization for macOS releases; block tagged releases without the signing credentials.
- Document the complete upstream comparison through 1.0.95.

## 2.19.3 — streamlined downloads and update overlays

- Ship one manual-update package format per platform: architecture-specific macOS ZIPs and the Windows NSIS installer with its required update metadata.
- Download the matching macOS ZIP from the in-app updater and explain the manual replacement steps.
- Keep the torrent drag-and-drop prompt above the page content and improve Darkhand lower-panel spacing.

## 2.19.2 — tracker favicons across themes

- Restore tracker favicon icons in the shared torrent table so they appear consistently in every theme.
- Derive safe HTTPS favicon URLs from tracker metadata and hide unavailable icons cleanly.

## 2.19.1 — renamed repository and desktop updates

- Renamed the GitHub repository to `micro23/Torrent-Deck` and updated app metadata, release links, update feeds, workflow names, and documentation.
- Build Windows NSIS installers and publish the `latest.yml`, installer, and blockmap assets required for in-app updates.
- Keep macOS update checks and compatible DMG downloads working with the renamed GitHub release URLs; report download and installer-open errors in the app.
- Document platform update behavior: Windows installs approved updates through NSIS; unsigned macOS builds open a DMG for manual replacement.

## 2.19.0 — Torrent-Deck identity and file opening

- New Torrent-Deck name, layered-deck icon, macOS bundle ID, Windows executable and handler registration, Linux desktop entry, and separate settings folder.
- Migrate existing fork profiles and certificates without modifying their original copies.
- macOS uses the current NSWorkspace default-app API and verifies the selected installed path; the deprecated API could report success while leaving the old app selected.
- Reclaim torrent file associations on installed macOS/Linux launches; Windows registers capabilities and offers the required Default Apps selection. Help provides a repeatable default-app setup command.
- Version-aware handler registration avoids replacing a recorded newer installation with an older Torrent-Deck copy. When a newer version starts while an older Torrent-Deck instance is running, the older instance relaunches the newer executable.
- Opening a torrent retains the actual file bytes even when optional preview metadata cannot be parsed. Deluge decides whether the file is supported.
- Updated README, explicit upstream author/contributor credits, and a downloadable icon archive attached to releases.

## 2.18.4 — interface, updates, and Deluge upload repairs

- Deluge torrent files use authenticated core JSON-RPC and preserve server defaults. Failed adds display errors and retain files for retry.
- GitHub update dialog shows installed/latest versions, progress, failures, and download actions. Unsigned macOS builds use manual DMG installation.
- Darkhand toolbar, centered search, themed start/pause controls, details docking, sidebar collapse/padding, theme picker, and panel layout repairs.
- Terminal collapsed-sidebar repairs and a bottom selection action menu across all 38 themes.
- Torrent-only versus torrent-and-data removal options; row details separate from checkbox selection; close/Escape restore details layout.
- Double-click column dividers to fit contents and explicit checking, verifying, queued, paused, stopped, seeding, and error states.
- Deck artwork/reference synchronization through 1.0.95 (`39b5882`), including Forest artwork and progress effects, seasonal and sports themes, optimized previews, and bundled local assets.
- Client connection port validation and aria2 JSON-RPC endpoint fixes already incorporated before testing was restricted to Deluge.
- Client integration tests now target Deluge only. Shared Windows/macOS/Linux source remains maintained; only macOS installers are compiled during refinement.

## 2.18.0–2.18.3 — initial fork development

- Modernized Electron/TypeScript code, isolated preload/IPC APIs, client integrations, and platform startup behavior.
- Multi-client Deck-inspired themed interface, customizable columns, bulk actions, notifications, torrent details, file priorities/selection where supported, saved upload locations, and transfer history.
- Theme gallery, five redesigned core styles, seasonal/sports themes, and locally bundled artwork.
- Fork-owned GitHub release/update pipeline, unsigned macOS packaging, asset names identifying their OS and architecture, and separate remote-client test profiles.

The original Electorrent supplied the app's foundational remote-client functionality. See [CREDITS.md](CREDITS.md) and Git history for attribution and detailed implementation history.
