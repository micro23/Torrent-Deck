/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the session manager with controlled runtime lifecycles. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadManager(runtimes, settings = {}) {
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync('src/main/lib/bittorrent/manager.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const modules = {
    'geoip-country': {},
    '../logger': { warn() {} },
    '../settings': { getAllSettings: () => settings },
    '../torrent-source-file': require('../../src/main/lib/torrent-source-file.ts'),
    './registry': { createRuntime: () => runtimes.shift() },
    '@shared/torrent-actions': { withTorrentActionAccelerators: actions => actions },
  }
  vm.runInNewContext(compiled, { exports, require: name => modules[name] || require(name) })
  return exports.bittorrentManager
}

function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

const sender = { id: 42 }
const profile = id => ({ id, client: 'deluge' })
const connection = { version: '2.2.0' }

test('successful upload removes only the regular, unchanged file whose bytes were uploaded', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'torrent-deck-cleanup-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filename = 'added.TORRENT'
  const file = path.join(directory, filename)
  const data = Buffer.from('original')
  const request = { data: new Uint8Array(data), filename, sourcePath: file }
  let onUpload = () => {}
  const settings = { autoRemoveTorrents: true }
  const manager = loadManager([{ actions: [], connect: async () => connection, uploadTorrent: () => onUpload() }], settings)
  await manager.connect(sender, profile('test'))

  fs.writeFileSync(file, data)
  await manager.uploadTorrent(sender, request)
  assert.equal(fs.existsSync(file), false)

  fs.writeFileSync(file, 'replaced')
  await manager.uploadTorrent(sender, request)
  assert.equal(fs.readFileSync(file, 'utf8'), 'replaced')

  fs.writeFileSync(file, data)
  onUpload = () => {
    const replacement = path.join(directory, 'replacement')
    fs.writeFileSync(replacement, data)
    fs.renameSync(replacement, file)
  }
  await manager.uploadTorrent(sender, request)
  assert.deepEqual(fs.readFileSync(file), data)

  onUpload = () => { throw Error('Deluge refused this upload') }
  await assert.rejects(manager.uploadTorrent(sender, request), /refused/)
  assert.deepEqual(fs.readFileSync(file), data)

  onUpload = () => { settings.autoRemoveTorrents = false }
  await manager.uploadTorrent(sender, request)
  assert.deepEqual(fs.readFileSync(file), data)
})

test('disconnect invalidates an in-flight connection without interrupting a newer profile', async () => {
  const login = deferred()
  const started = deferred()
  let closed = 0
  const stale = { actions: [], connect: () => { started.resolve(); return login.promise }, disconnect: async () => { closed++ } }
  const fresh = { actions: [], connect: async () => connection, getSnapshot: async () => 'new profile' }
  const manager = loadManager([stale, fresh])
  const first = manager.connect(sender, profile('old'))
  const superseded = assert.rejects(first, /Stale bittorrent connection/)
  await started.promise
  await manager.disconnect(sender)
  assert.equal(manager.hasSession(sender), false)
  await manager.connect(sender, profile('new'))
  login.resolve(connection)
  await superseded
  assert.equal(closed, 1)
  assert.equal(manager.getSessionState(sender).activeServerId, 'new')
  assert.equal(await manager.getSnapshot(sender), 'new profile')
})

test('torrent dispatch only calls supported controls or menu actions', async () => {
  const runtime = {
    actions: [{ label: 'Queue', menu: [{ action: 'queueTop' }] }],
    connect: async () => connection,
    queueTop: ids => ids[0],
    pauseAll: () => 'paused',
    getSnapshot: () => 'use the dedicated snapshot channel',
  }
  const manager = loadManager([runtime])
  await manager.connect(sender, profile('queue'))
  assert.equal(await manager.invokeAction(sender, { action: 'queueTop', ids: ['first'] }), 'first')
  assert.equal(await manager.invokeAction(sender, { action: 'pauseAll' }), 'paused')
  await assert.rejects(manager.invokeAction(sender, { action: 'getSnapshot' }), /Unsupported bittorrent action/)
})
