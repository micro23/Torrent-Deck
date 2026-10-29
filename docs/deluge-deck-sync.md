# Deluge Deck source comparison and desktop port

Reviewed October 24, 2026. Electorrent fork created October 4 at 02:12:11 UTC.
Reference baseline: `619328af5f8549d6b7068fd228c61329f928b765` (1.0.73).
Latest behavior reviewed: Deluge Deck 1.0.96 at `9c64c8cb2be837b64dcf03e4d60d250958ef0bed`.
Theme/artwork baseline: 1.0.95 at `39b5882a7caf379166245e6dd12435d26fb59bbe`; 1.0.96 does not change those source files.
The intervening source changes through 1.0.95 were reviewed; the later cleanup
commit removes unused source assets and recompresses the stadium photography.

The original `deluge-deck-reference` checkout is read-only and remains unchanged.
A separate, ignored checkout under `.dream-loop/deck-latest` supplied the current
source, artwork, typography and visual reference screenshots.

## Every commit since the fork

| Commit | Update | Electorrent implementation |
| --- | --- | --- |
| `f00dc0f` | 1.0.74: consistent column defaults | Shared order on every theme; migration of exact old defaults; custom orders and saved resize widths preserved. |
| `c928de8` | 1.0.75: compact Darkhand table/details | Compact rows, content-sized short table, blank details until selection, controls within the dashboard. |
| `4cd3c4a` | 1.0.76: Darkhand default and shortcuts | Darkhand on a new installation, direct D shortcut, Darkhand first in the canonical theme order, configured connection password focus. Existing theme preferences remain saved. |
| `ba26ca3` | Matrix and tighter spacing | Complete Matrix colors, typography, code rain SVG, identity, card finishes, table/sidebar materials and reduced-motion support; compact table spacing. |
| `25d40e3` | 1.0.78 cinematic Matrix rebuild | Actual atmosphere artwork, Matrix glyph identity, cinematic masthead, horizontal telemetry cards, clean data table and updated typefaces. |
| `f801582` | 1.0.77 release | Matrix appears in theme selection and T/Shift+T cycling; Regular, Holiday and Sports categories. |
| `0e543bc` | 1.0.87 Terminal label cleanup | Expanded shelf reads `[ Menu ]`; collapsed shelf retains `[ > ]`; preview refreshed. |
| `bb6b91b` | 1.0.88 core theme redesign | Ported distinct Midnight, Paper, Ocean, Forest and Sunset identities, artwork, opaque palettes, typography, dashboard symbols, progress patterns and reduced-motion behavior. |
| `4fe589a` | 1.0.89 theme gallery refresh | Refreshed the bundled theme previews from the latest source. Web plugin packaging and README screenshots do not apply to the Electron app. |
| `65bed43` | 1.0.90 refreshed core themes | Imported the revised palette, typography and surface materials across the core themes. |
| `ac10760` | 1.0.91 Forest AAA and centered search | Imported Forest contrast refinements and centered-search materials while retaining the desktop toolbar adapter. |
| `faa8c2f` | 1.0.92 centered statistics and spacing | Imported centered card statistics, simplified stat icons and tightened checkbox spacing. |
| `f179441` | 1.0.93 real stadium photography | Imported authentic venue photography and refined sports masthead branding. |
| `42e115b` | 1.0.94 base-aware stadium paths | Imported corrected asset URL resolution for Electron-bundled sports artwork. |
| `55a6c1e` | 1.0.95 authentic venue photos | Replaced sports venue backdrops with current photography; all 24 club assets are bundled locally. |
| `39b5882` | source asset cleanup | Kept the latest optimized sports backdrops and omitted source-only unused files from the desktop port. |
| `9c64c8c` | 1.0.96 menu/action repairs | Ported applicable Deluge result/status/allocation fixes, protected settings loading, responsive settings geometry and child-menu Escape handling. See the coverage audit below. |

Latest default columns: Torrent, State, Size, Progress, Download, Upload, ETA,
Ratio, Seeds, Peers, Seeding time. Optional columns remain in the existing
column chooser. Seeding time comes from clients that report it; unavailable
statistics are shown as unavailable rather than inferred from active time.

## 1.0.96 fix coverage

Deluge Deck is a separate React/WebUI application, so its commit is reviewed and
adapted rather than merged into the Electron/Angular history. Every fix in
`9c64c8c` has the following disposition:

| Reference fix | Desktop disposition |
| --- | --- |
| Settings/menu spacing and reachable actions at narrow widths | Settings use a flexible frame with wrapping navigation below 900px, shrinkable fields and fixed reachable footer controls. The frame fits below the native title bar. |
| Floating menus/dialogs escape transformed or clipped theme containers | Already implemented through the separate Electron context-menu window and Fomantic body-level modal container. Escape now dismisses an active child dropdown before its parent modal. |
| Settings cannot be edited/saved before loading | Settings fields and Save remain disabled until persisted values load; failed loads show an error. Duplicate saves are blocked and failed writes permit retry. |
| Daemon settings require readback; cache units use 16 KiB blocks and accept -1 | No desktop daemon-preferences editor exists. Torrent-Deck preferences are local configuration persisted through the existing acknowledged settings IPC. No unsupported daemon/cache controls are copied. |
| `is_auto_managed` status writes `auto_managed` | Existing status mapping already prefers `is_auto_managed`. No desktop auto-management editor sends the incorrect status key as an option. |
| `prioritize_first_last` status differs from the write option | Details now read the correct status field, preserving false and retaining a legacy fallback. Uploads already write `prioritize_first_last_pieces`. |
| Allocation writes `pre_allocate_storage` | URL/WebUI upload defaults now use `pre_allocate_storage: false`, replacing ignored `compact_allocation`. Direct file uploads preserve server defaults unless options are explicitly provided. |
| Successful RPC envelopes can contain failed removals | Desktop uses individual `core.remove_torrent` calls rather than the WebUI batch API. Both removal modes now require a true acknowledgment for each hash and report refused/malformed results. |
| Repeated bridge injection, stock login masks, ExtJS page relayout and native widget scoping | Web-plugin-only fixes: the Electron app does not load the bridge or ExtJS. Its reference project and plugin files remain unchanged. |

The reference theme CSS, sports metadata and artwork are byte-for-byte unchanged
between 1.0.95 and 1.0.96; regenerated WebUI bundle manifests are plugin packaging,
not new desktop theme assets. The generated desktop theme header therefore keeps
its accurate 1.0.95 material baseline.

## Theme material port

All 38 theme choices share `src/shared/deck-themes.ts`. Current source materials
are imported from 18 reference CSS files into `deck-reference.less`, with the
native Angular/Electron geometry in `deck-reference-adapter.less`. The importer
also refreshes local artwork, fonts, club metadata and 1.0.89 gallery previews. Run:

```sh
node scripts/sync-deck-reference.mjs /absolute/path/to/reference-copy
npm run build
```

The importer only writes to Electorrent. Artwork, fonts, sport logos, stadiums,
card ornaments and gallery previews are local assets. Sports have their actual
club wordmarks, motifs and mastheads; Mets retains its bespoke skyline/cap mark.
Terminal retains its existing CRT implementation, with a transparent native
window drag region across its top edge. Search and buttons are excluded from
that region.

The desktop adaptation retains Electorrent's selected-torrent Start/Pause
controls alongside global Pause/Resume, Add torrent, preferences, its native
client support and torrent details/files/peers/trackers. The user's larger bold
text, centered data/header labels, and percentage labels beneath progress bars
are intentional differences from the web reference. Holiday SVG fills retain
the previous completion fixes.

Darkhand includes saved stats/detail placements, six live statistics, transfer
history range choices from 5 minutes to 90 days, custom range entry, and saved
resizable bottom/right details. The chart stores samples per server while
Electorrent is open, keeps fine samples for an hour, minute samples thereafter,
and draws at most 600 points. It does not claim to record while the application
is closed or install/change the Deluge Deck daemon plugin. Deluge's existing
snapshot supplies session network statistics; other clients show unavailable
session-only fields as a dash.

## Verification

- Run `npm run lint`, `npm run build`, then targeted headless Deluge tests.
- Unit regressions cover refused/partial removal, first/last status versus option
  keys, allocation defaults, settings load failures and duplicate/failed saves.
- Deluge integration covers settings after window resizing, child dropdown
  dismissal, supported torrent actions, uploads and populated details.
- The existing theme sweep checks all 38 theme choices, detail column readability,
  content sizing and the full-width session footer.
- Release validation compiles matching universal macOS and Windows installers,
  exercises native file workflows and verifies published asset hashes.

This is a desktop adaptation of the actual theme source, not a claim that every
pixel of the React web application is identical. Web-only authentication,
Deluge plugin packaging and mobile navigation are not substituted for
Electorrent's desktop connection/client architecture.

## October 29, 2026 — shared fit policy

The user explicitly authorized improving both projects. Torrent-Deck 2.19.21 and Deluge Deck 1.0.99 use proportional width preferences constrained to the available pane. Desktop narrow detail tables reflow into labeled fields; main tables retain enabled columns and wrap values. Existing explicit column visibility choices remain intact.
