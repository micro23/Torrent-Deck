# Running checks

From the Electorrent directory:

```sh
npm run lint
npm run build
npm run smoketest
```

The smoke test launches hidden Electron windows and a disposable Deluge 2
Docker fixture. It checks that uploaded torrents appear and begin downloading.
Only Deluge client tests are run currently; testing other clients requires an
explicit user request. Tests do not connect to your saved servers.

Tests use disposable settings/profile directories. On macOS the runner copies
`app/` to a temporary directory to avoid Documents-folder access restrictions
in ChromeDriver children. It removes that copy when the run ends. Rebuild before
running tests so the copy contains your latest code. ChromeDriver is downloaded
and cached by WebdriverIO; the runner uses Node's native fetch for compatibility
with Node 26. The repository's `.nvmrc` and CI still specify Node 22.

## Real client integration

```sh
npm run smoketest:integration
```

This targets stopping and resuming torrents in Deluge. It requires a running Docker
engine and Docker Compose. Check them with `docker info` and
`docker compose version` before running it. Build and publish both macOS and
Windows installers for each release; shared source also supports Linux.

The runner selects the native Electron binary explicitly. On macOS its small
launcher starts in the temporary directory so the Node inspector can resolve
its working directory without stalling on a protected folder.
