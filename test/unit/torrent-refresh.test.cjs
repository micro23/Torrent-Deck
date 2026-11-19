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
  const page = { $on: (event, callback) => events.set(event, callback) }
  const root = { $on() {}, $applyAsync() {}, $emit() {} }
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
    require: name => name === 'fuse.js' ? require(name) : {},
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
