/* eslint-disable @typescript-eslint/no-require-imports -- File launch serialization is tested independently from client daemons. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const os = require('node:os')
const path = require('node:path')

test('a .torrent file still reaches the upload queue when its optional preview cannot be parsed', async () => {
  const bytes = Buffer.from('torrent data supported by the remote client')
  const modules = {
    electron: {}, '@shared/ipc': {}, './electorrent': {}, './notify': {},
    fs: { promises: { stat: async () => ({ isFile: () => true, size: bytes.length }), readFile: async () => bytes } },
    'parse-torrent': () => { throw Error('Unsupported metadata version') },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/main/lib/torrents.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, { exports, Buffer, Uint8Array, setTimeout: callback => callback(), require: name => modules[name] || require(name) })
  const torrent = await exports.serializeTorrentFile('/downloads/example.torrent', true)
  assert.equal(torrent.filename, 'example.torrent')
  assert.deepEqual(Buffer.from(torrent.data), bytes)
  assert.equal(torrent.sourcePath, '/downloads/example.torrent')
  assert.equal(torrent.metadata, undefined)
})

test('file selection and launch preserve native paths and report unreadable files without losing valid files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'torrent-deck-files-'))
  const filename = path.join(directory, 'My torrent ü.TORRENT')
  const missing = path.join(directory, 'missing.torrent')
  const bytes = Buffer.from('torrent bytes forwarded unchanged to Deluge')
  fs.writeFileSync(filename, bytes)
  const notifications = []
  const modules = {
    electron: { dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [missing, filename] }) } },
    '@shared/ipc': { IPC_CHANNELS: { notifications: { push: 'notify' } } },
    './electorrent': { getWindow: () => ({ webContents: { send: (_channel, data) => notifications.push(data) } }) },
    'parse-torrent': () => { throw Error('Preview unsupported') },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/main/lib/torrents.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, { exports, Buffer, Uint8Array, Error, setTimeout: callback => callback(), require: name => modules[name] || require(name) })
  try {
    for (const files of [await exports.browse(true), await exports.readFiles([missing, filename], true)]) {
      assert.equal(files.length, 1)
      assert.equal(files[0].sourcePath, filename)
      assert.equal(files[0].filename, path.basename(filename))
      assert.equal(files[0].askUploadOptions, true)
      assert.deepEqual(Buffer.from(files[0].data), bytes)
    }
    assert.equal(notifications.length, 2)
    assert.equal(notifications[0].title, 'Could not open torrent file')
    assert.match(notifications[0].message, /missing.torrent/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
