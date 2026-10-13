# Deluge review — October 13, 2026

Reviewed the Deluge main-process RPC adapter, renderer adapter, torrent model,
upload paths, refresh handling, and the existing Deluge feature tests. Production
changes are confined to the Deluge adapter. No other torrent client implementation
or separate Deluge Deck reference project was changed.

## Repairs

- Reject malformed JSON-RPC responses instead of treating them as successful
  actions. Valid `result: null` responses remain supported. Server errors without
  a message now have a readable fallback.
- Reject snapshots without a valid torrent map. Previously a malformed snapshot
  could propagate to the renderer as an empty list and clear the visible torrents.
- Preserve unavailable disk-space values as unknown instead of coercing null or
  blank strings to zero. A genuine zero still means zero bytes free.
- Preserve tracker tier zero when Deluge returns its numeric value as a string;
  editing another tracker no longer silently changes its tier.
- Repair the tracker-sorting integration test's timing race by waiting for the
  requested descending order after the header click. This was the sole failure
  in the preceding full master CI run (23 of 24 suites passed).

## Validation

Completed in the required order: lint, production build, then tests.

- `npm run lint`: passed.
- `npm run build`: passed.
- Updater, Deluge RPC/upload, server address, file association/opening, launch
  queue, torrent state, and drop regression tests: 35 passed, including five new
  Deluge regression cases.
- Targeted real Deluge integration run: 24 tests passed across uploads, trackers,
  torrent actions, and connection suites; one unsupported action was skipped.
- Full headless Deluge 2 integration run: all 24 spec files passed, with 145
  passing test cases and seven skipped cases. Command:
  `npm test -- --client deluge:2 --parallel --headless`.
- Snapshot regression coverage verifies that 0, 1, and 1,000 torrents each use
  only three HTTP requests with labels and disk-space reporting enabled.
- Native Mac workflow check against a local Deluge-protocol fixture: five passed
  (picker, menu, file launch, drop, modifier drop), including immediate appearance
  without reloading and removal. Run with `--force-title-bar-menu`, matching CI;
  the initial invocation without that flag could not find the test's menu button.

The full run covers settings, startup, reconnect, authentication/TLS, watched
folders, source-file cleanup, keyboard shortcuts, layout, all-theme content
sizing, columns/resizing, file/menu/open/drop entry points, torrent/peer/file/
tracker details, file priorities, labels, speed and ratio limits, pause/resume,
removal with and without data, file/magnet uploads, advanced upload options,
upload file selection, and queued uploads.

## Limits

This is broad automated coverage, not proof of every OS interaction or arbitrary
server configuration. The seven skipped cases cover platform-inapplicable state,
unsupported Set Location, hiding unsupported tabs on a client that supports them,
the separate wanted-checkbox capability, tracker sidebar filtering, sequential
upload options, and upload-time renaming. Deluge file inclusion/exclusion is
covered through file priorities and advanced upload file selection instead.

The current integration runs use macOS Electron and disposable Docker Deluge
2.2.0 servers. No fresh Windows installer, end-to-end Windows update installation,
live user-server test, or installer release was performed for this review. Native
Windows file workflows were validated by the preceding v2.19.12 CI release work.
Queue positioning and force-recheck remain code-reviewed rather than individually
covered by the current end-to-end suite.
