/* eslint-disable @typescript-eslint/no-require-imports -- Exercise asynchronous tracker actions without a live daemon. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const url = 'https://tracker.example/announce'
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function trackerTab(overrides = {}) {
  const calls = [], closed = []
  const client = {
    features: { torrentTrackerManagement: true },
    getTorrentDetailsTrackers: async () => ({ items: [] }),
    addTorrentTracker: async (...args) => { calls.push(['add', ...args]) },
    editTorrentTracker: async (...args) => { calls.push(['edit', ...args]) },
    removeTorrentTracker: async (...args) => { calls.push(['remove', ...args]) },
    ...overrides,
  }
  const scope = {
    torrent: { id: 'torrent' }, $watch() {}, $watchGroup() {}, $on() {}, $evalAsync() {},
    trackerModalRef: { showModal() {}, hideModal() { closed.push('save') } },
    removeModalRef: { showModal() {}, hideModal() { closed.push('remove') } },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/torrent-details-trackers-tab/torrent-details-trackers-tab.controller.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, URL, require: () => ({ DEFAULT_TABLE_RESIZE_OPTIONS: {} }) })
  const controller = new exports.TorrentDetailsTrackersTabController(scope, { $btclient: client }, {
    getAllSettings: () => ({ ui: {} }),
  })
  return { controller, scope, client, calls, closed }
}

test('background refresh cannot unlock a pending tracker save or change its dialog', async () => {
  const pending = deferred()
  let writes = 0
  const tab = trackerTab({ addTorrentTracker: () => { writes++; return pending.promise } })
  tab.controller.openAddTracker()
  tab.scope.trackerUrl = url
  const save = tab.controller.saveTracker()
  await tab.controller.load()
  assert.equal(tab.scope.loading, false)
  assert.equal(tab.scope.saving, true)
  await tab.controller.saveTracker()
  tab.controller.openEditTracker({ url: 'https://another.example/announce' })
  assert.equal(tab.scope.trackerUrl, url)
  assert.equal(writes, 1)
  pending.resolve()
  await save
  assert.equal(tab.scope.saving, false)
  assert.deepEqual(tab.closed, ['save'])
})

test('failed tracker removal stays open, reports the error, and permits retry', async () => {
  const pending = deferred()
  let writes = 0
  const tab = trackerTab({ removeTorrentTracker: () => { writes++; return writes === 1 ? pending.promise : Promise.resolve() } })
  tab.controller.openRemoveTracker({ url })
  const remove = tab.controller.removeTracker()
  await tab.controller.load()
  await tab.controller.removeTracker()
  assert.equal(writes, 1)
  assert.equal(tab.scope.saving, true)
  assert.deepEqual(tab.closed, [])
  pending.reject(new Error('Server refused removal'))
  await remove
  assert.equal(tab.scope.mutationError, 'Server refused removal')
  assert.equal(tab.scope.saving, false)
  assert.deepEqual(tab.closed, [])
  await tab.controller.removeTracker()
  assert.equal(writes, 2)
  assert.equal(tab.scope.mutationError, null)
  assert.deepEqual(tab.closed, ['remove'])
})

test('invalid tracker addresses are rejected before sending a request', async () => {
  const tab = trackerTab()
  for (const value of ['', '   ', 'tracker.example/announce', 'file:///tmp/tracker', 'https://']) {
    tab.scope.trackerUrl = value
    await tab.controller.saveTracker()
    assert.match(tab.scope.mutationError, /valid HTTP/)
  }
  assert.equal(tab.calls.length, 0)
  assert.deepEqual(tab.closed, [])
})

test('supported tracker protocols are saved with surrounding whitespace removed', async () => {
  const tab = trackerTab()
  for (const protocol of ['http', 'https', 'udp', 'ws', 'wss']) {
    const address = `${protocol}://tracker.example:6969/announce`
    tab.scope.trackerUrl = `  ${address}  `
    await tab.controller.saveTracker()
    assert.equal(tab.calls.at(-1)[2], address)
  }
  assert.equal(tab.calls.length, 5)
})

test('failed tracker saves retain the input and can be retried', async () => {
  let writes = 0
  const tab = trackerTab({ editTorrentTracker: async () => { if (++writes === 1) throw Error('Connection lost') } })
  tab.controller.openEditTracker({ url })
  tab.scope.trackerUrl = 'https://replacement.example/announce'
  await tab.controller.saveTracker()
  assert.equal(tab.scope.mutationError, 'Connection lost')
  assert.equal(tab.scope.trackerUrl, 'https://replacement.example/announce')
  assert.equal(tab.scope.saving, false)
  assert.deepEqual(tab.closed, [])
  await tab.controller.saveTracker()
  assert.equal(writes, 2)
  assert.deepEqual(tab.closed, ['save'])
})
