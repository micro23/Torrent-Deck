/* eslint-disable @typescript-eslint/no-require-imports -- VM harness verifies Deluge requests and upload failure handling. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(filename, modules) {
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(compiled, { exports, Buffer, Error, require: name => modules[name] || require(name) })
  return exports
}

function runtime(result = 'torrent-hash', error, response) {
  const calls = []
  const helpers = {
    HTTP_REQUEST_TIMEOUT: 30000,
    defer: fn => new Promise((resolve, reject) => fn((err, value) => err ? reject(err) : resolve(value))),
  }
  const { DelugeRuntime } = load('src/main/lib/bittorrent/clients/deluge/index.ts', {
    '@main/lib/bittorrent/helpers': helpers,
    request: (options, callback) => {
      calls.push(options)
      callback(null, { statusCode: 200 }, response ? response(options.body) : { result, error })
    },
  })
  const api = new DelugeRuntime()
  api.rpcUrl = 'https://example.test/deluge/json'
  api.requestOptions = { jar: 'authenticated-cookie-jar' }
  return { api, calls }
}

test('Deluge sends exact file bytes through the authenticated JSON endpoint with upload options', async () => {
  const { api, calls } = runtime()
  const bytes = new Uint8Array([0, 128, 255, 100])
  await api.uploadTorrent(bytes, 'example.torrent', { saveLocation: '/downloads', startTorrent: false,
    fileSelection: [{ index: 0, wanted: true }, { index: 1, wanted: false }] })
  assert.equal(calls.length, 1)
  const request = calls[0]
  assert.equal(request.url, 'https://example.test/deluge/json')
  assert.equal(request.jar, 'authenticated-cookie-jar')
  assert.equal(request.body.method, 'core.add_torrent_file')
  assert.equal(request.body.params[0], 'example.torrent')
  assert.deepEqual(Buffer.from(request.body.params[1], 'base64'), Buffer.from(bytes))
  assert.equal(request.body.params[2].download_location, '/downloads')
  assert.equal(request.body.params[2].add_paused, true)
  assert.deepEqual(Array.from(request.body.params[2].file_priorities), [1, 0])
  assert.equal(request.body.params[2].max_download_speed, undefined, 'Preserve server defaults')
})

test('Deluge rejection is not treated as a successful upload', async () => {
  const { api } = runtime(null)
  await assert.rejects(api.uploadTorrent(new Uint8Array([1]), 'bad.torrent'), /did not add the torrent/)
})

test('Deluge reports the server add error', async () => {
  const { api } = runtime(null, { message: 'Permission denied in download directory' })
  await assert.rejects(api.uploadTorrent(new Uint8Array([1]), 'example.torrent'), /Permission denied/)
})

test('Deluge identifies a rejected Web session for the connection error dialog', async () => {
  const { api } = runtime(null, { message: 'Not authenticated', code: 1 })
  await assert.rejects(api.pause(['hash']), error => error.code === 'DELUGE_SESSION_EXPIRED')
})

test('Deluge rejects malformed RPC envelopes but accepts valid void results', async () => {
  for (const body of [null, '<html>proxy error</html>', [], {}, { error: null }]) {
    const { api } = runtime(null, null, () => body)
    await assert.rejects(api.pause(['hash']), /Invalid response/)
  }
  await runtime(null).api.pause(['hash'])
  const { api } = runtime(null, { code: 1 })
  await assert.rejects(api.pause(['hash']), /Deluge API request failed/)
})

test('Deluge rejects malformed snapshots instead of replacing the list with an empty one', async () => {
  for (const result of [null, {}, { torrents: null }, { torrents: [] }]) {
    await assert.rejects(runtime(result).api.getSnapshot(), /Invalid torrent snapshot/)
  }
  const snapshot = await runtime({ torrents: {}, stats: {} }).api.getSnapshot()
  assert.deepEqual(Object.keys(snapshot.torrents), [])
})

test('Deluge snapshot requests stay constant as torrent count grows', async () => {
  for (const count of [0, 1, 1000]) {
    const torrents = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), { name: String(i) }]))
    const { api, calls } = runtime(null, null, ({ method }) => ({ result:
      method === 'web.update_ui' ? { torrents, stats: {} } : method === 'label.get_labels' ? ['movies'] : 1024 }))
    api.supportsLabels = true
    api.downloadLocation = '/downloads'
    const snapshot = await api.getSnapshot()
    assert.equal(Object.keys(snapshot.torrents).length, count)
    assert.equal(calls.length, 3)
  }
})

test('Deluge preserves unavailable free space instead of reporting a full disk', async () => {
  for (const value of [null, undefined, '', ' ', -1, 'bad', 0, '1024']) {
    const { api } = runtime(null, null, ({ method }) => ({ result:
      method === 'web.update_ui' ? { torrents: {} } : value }))
    api.downloadLocation = '/downloads'
    assert.equal((await api.getSnapshot()).freeDiskSpace, value === 0 ? 0 : value === '1024' ? 1024 : null)
  }
})

test('Deluge tracker edits preserve tier zero returned as a string', async () => {
  const { api, calls } = runtime(null, null, ({ method }) => ({ result:
    method === 'web.get_torrent_status' ? { trackers: [{ url: 'udp://first', tier: '0' }, { url: 'udp://second', tier: '0' }] } : null }))
  await api.editTorrentTracker('hash', 'udp://second', 'udp://changed')
  const trackers = calls[1].body.params[1]
  assert.equal(trackers[1].url, 'udp://changed')
  assert.equal(trackers[1].tier, 0)
})

test('failed add keeps the queued file and shows its error for retry', async () => {
  const { AddTorrentModalController } = load('src/renderer/app/directives/add-torrent-modal/add-torrent-modal.controller.ts', {})
  const file = { type: 'file', filename: 'example.torrent', data: new Uint8Array([1]) }
  const scope = { torrents: [file], $watch() {}, $applyAsync() {},
    uploadTorrentAction: async () => { throw new Error('Deluge rejected the torrent') } }
  const controller = new AddTorrentModalController(scope, {})
  controller.modalref = { hideModal() { throw new Error('Failed upload closed the dialog') } }
  await controller.uploadCurrentTorrent()
  assert.equal(scope.torrents[0], file)
  assert.equal(controller.uploadError, 'Deluge rejected the torrent')
  assert.equal(controller.isLoading, false)
})
