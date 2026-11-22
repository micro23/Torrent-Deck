/* eslint-disable @typescript-eslint/no-require-imports -- Run refresh lifecycle checks without a native window. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function createPage() {
  const events = new Map()
  const timers = new Set()
  const stored = new Map()
  const alerts = []
  const page = { $on: (event, callback) => events.set(event, callback), $watch() {} }
  const root = { $on: () => () => {}, $applyAsync() {}, $emit() {} }
  const timeout = callback => { timers.add(callback); return callback }
  timeout.cancel = callback => timers.delete(callback)
  const q = Object.assign(executor => new Promise(executor), {
    resolve: value => Promise.resolve(value), reject: error => Promise.reject(error),
  })
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/torrents-page/torrents-page.controller.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(compiled, {
    exports,
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    window: { performance, electorrent: { app: { getMeta: async () => ({}) }, bittorrent: { setSelectedTorrents() {} } } },
    require: name => {
      if (name === 'fuse.js') return require(name)
      if (name === './ocean-telemetry') return require('../../src/renderer/app/directives/torrents-page/ocean-telemetry.ts')
      if (name.endsWith('torrent-label-filter')) return { matchesLabelFilter: (label, filter) => !filter || label === filter }
      return {}
    },
  })
  new exports.TorrentsPageController(root, page, timeout, () => {}, q, {}, {
    alert: (...args) => alerts.push(args), enableAll() {}, disableAll() {},
  }, { getAllSettings: () => ({ ui: {} }) })
  return { events, timers, stored, alerts, page, root }
}

test('a poll that fails after leaving the torrent page cannot restart the previous session', async () => {
  const { events, timers, alerts, root } = createPage()
  let rejectSnapshot
  root.$server = { id: 'old' }
  root.$btclient = { torrents: () => new Promise((_resolve, reject) => { rejectSnapshot = reject }) }
  events.get('start:torrents')({}, true)
  events.get('stop:torrents')()
  rejectSnapshot(new Error('Previous profile disconnected'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers.size, 0)
  assert.deepEqual(alerts, [])
})

test('the transfer chart switches to each server’s own saved history', async () => {
  const { events, stored, page, root } = createPage()
  const now = Date.now() - 1000
  stored.set('electorrent-deck-history:first', JSON.stringify([[now, 110, 220]]))
  stored.set('electorrent-deck-history:second', JSON.stringify([[now, 550, 660]]))
  root.$btclient = { torrents: async () => ({ all: [], dirty: true }) }
  const columns = [{ attribute: 'dateAdded', sort: (a, b) => a - b }]
  root.$server = { id: 'first', columns }
  await page.update()
  assert.equal(page.deckChartMax, 220 * 1.2)
  events.get('stop:torrents')()
  events.get('wipe:torrents')()
  root.$server = { id: 'second', columns }
  await page.update()
  assert.equal(page.deckChartMax, 660 * 1.2)
  assert.equal(JSON.parse(stored.get('electorrent-deck-history:first'))[0][2], 220)
})

test('Ocean telemetry groups actual torrents and samples each server separately', async () => {
  const { events, page, root } = createPage()
  const row = (id, percent, uploadSpeed) => ({
    id, percent, uploadSpeed, downloadSpeed: 0,
    isStatusDownloading: () => false, isStatusSeeding: () => true,
    isStatusPaused: () => false, isStatusQueued: () => false, isStatusCompleted: () => true,
    isStatusStopped: () => false, isStatusError: () => false,
  })
  root.deckTheme = 'ocean'
  root.$server = { id: 'ocean', columns: [] }
  root.$btclient = { torrents: async () => ({
    all: [row('1', 970, 100), row('2', 990, 200)], dirty: true,
    sessionStats: { download_rate: 800, upload_rate: 300, num_connections: 6, max_num_connections: 12 },
  }) }
  await page.update()
  assert.equal(page.oceanLibrary.sectors[1].count, 2)
  assert.equal(page.oceanLibrary.contacts.length, 1)
  assert.equal(page.oceanLibrary.contacts[0].progress, 98)
  assert.equal(page.oceanLibrary.peak, 300)
  assert.equal(page.oceanTrace.peak, 800)
  assert.equal(page.oceanConnectionFill, 50)
  page.changeSorting({ sortKey: 'size', descending: true })
  assert.equal(page.oceanTrace.samples, 1)
  events.get('wipe:torrents')()
  assert.equal(page.oceanTrace.samples, 0)
  assert.equal(page.oceanLibrary.contacts.length, 0)
})

test('mutations during a poll share a fresh full snapshot after it completes', async () => {
  const { page, root } = createPage()
  const requests = []
  root.$server = { id: 'one', columns: [] }
  root.$btclient = { torrents: full => new Promise(resolve => requests.push({ full, resolve })) }
  const poll = page.update()
  const afterUpload = page.update(true)
  assert.equal(page.update(true), afterUpload)
  assert.deepEqual(requests.map(request => request.full), [false])
  requests[0].resolve({ all: [], dirty: true, sessionStats: { connections: 3 } })
  await poll
  assert.deepEqual(requests.map(request => request.full), [false, true])
  requests[1].resolve({ all: [], dirty: true, sessionStats: { connections: 4 } })
  await afterUpload
  assert.equal(page.sessionStats.connections, 4)
})

test('a queued refresh from an old server never starts on the new profile', async () => {
  const { events, page, root } = createPage()
  let finishOld
  let newCalls = 0
  root.$server = { id: 'one' }
  root.$btclient = { torrents: () => new Promise(resolve => { finishOld = resolve }) }
  const pending = page.update()
  const queued = page.update(true)
  events.get('stop:torrents')()
  root.$server = { id: 'two' }
  root.$btclient = { torrents: async () => { newCalls++; return { sessionStats: { connections: 9 } } } }
  await page.update(true)
  finishOld({ sessionStats: { connections: 1 } })
  await Promise.all([pending, queued])
  assert.equal(newCalls, 1)
  assert.equal(page.sessionStats.connections, 9)
})

test('cached sidebar counts include active and paused torrents when a saved sort key is unavailable', async () => {
  const { page, root } = createPage()
  const row = (id, paused) => ({
    id, dateAdded: id, isStatusPaused: () => paused, isStatusStopped: () => paused,
    isStatusDownloading: () => !paused, isStatusSeeding: () => false,
    isStatusQueued: () => false, isStatusCompleted: () => false, isStatusError: () => false,
  })
  root.$server = { id: 'one', columns: [{ attribute: 'dateAdded', sort: (a, b) => a - b }] }
  root.$btclient = { torrents: async () => ({ all: [row(1, false), row(2, true)], dirty: true }) }
  page.changeSorting({ sortKey: 'retiredColumn', descending: true })
  await page.update()
  assert.deepEqual(Array.from(page.arrayTorrents, torrent => torrent.id), [1, 2])
  assert.equal(page.statusCounts.all, 2)
  assert.equal(page.statusCounts.active, 1)
  assert.equal(page.statusCounts.paused, 1)
})
