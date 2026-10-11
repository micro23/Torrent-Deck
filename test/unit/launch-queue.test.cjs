/* eslint-disable @typescript-eslint/no-require-imports -- The renderer launch queue is tested without a native window. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

test('files opened during a later connection are delivered after that connection succeeds', async () => {
  const broadcasts = []
  const scope = { $on() {}, $applyAsync() {}, $broadcast: (...args) => broadcasts.push(args) }
  const root = { $on() {} }
  let onFiles
  const bridge = {
    launch: { onMagnets() {}, onTorrentFiles: callback => { onFiles = callback },
      getPending: async () => ({ magnets: [], torrentFiles: [] }) },
    menu: { onAction: () => () => {} },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/app-shell/app-shell.controller.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, console, localStorage: {}, document: {},
    window: { electorrent: bridge, addEventListener() {}, removeEventListener() {} },
    require: name => name.endsWith('menu-action-handler') ? { createMenuActionHandler: () => () => {} } : {},
  })
  const timeout = () => undefined
  timeout.cancel = () => {}
  new exports.AppShellController(root, scope, timeout, {}, { getServers: () => [], updateServer() {} }, {})
  const server = { id: 'deluge', name: 'Deluge', connect: async () => {
    root.$btclient = {}
    root.$server = { isConnected: true }
  } }
  scope.connectToServer(server)
  await new Promise(resolve => setImmediate(resolve))
  let finishConnection
  server.connect = () => new Promise(resolve => { finishConnection = () => {
    root.$btclient = {}
    root.$server = { isConnected: true }
    resolve()
  } })
  scope.connectToServer(server)
  onFiles([{ type: 'file', filename: 'queued.torrent', data: new Uint8Array([1, 2]), askUploadOptions: true }])
  assert.equal(broadcasts.filter(([event]) => event === 'torrents:add').length, 0)
  finishConnection()
  await new Promise(resolve => setImmediate(resolve))
  const uploads = broadcasts.filter(([event]) => event === 'torrents:add')
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0][1].filename, 'queued.torrent')
  assert.equal(uploads[0][2], true)
})
