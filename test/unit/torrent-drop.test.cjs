/* eslint-disable @typescript-eslint/no-require-imports -- VM harness exercises native drag data lifetimes without a browser. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function drop(files, isMacOS, keys = {}) {
  const events = []
  const handlers = {}
  let resolveMeta
  const meta = new Promise(resolve => { resolveMeta = resolve })
  const root = { $emit: (...args) => events.push(args), $broadcast: (...args) => events.push(args), $applyAsync: callback => callback() }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/drag-and-drop/drag-and-drop.directive.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, Error, Uint8Array, document: {},
    window: { electorrent: { app: { getMeta: () => meta }, torrents: { getPathForFile: file => `/downloads/${file.name}` } } },
    require: () => ({}),
  })
  const directive = new exports.DragAndDropDirective(root)
  directive.link({ $on() {} }, { on: (name, callback) => { handlers[name] = callback } })
  const fileList = [...files]
  handlers.drop({ originalEvent: { dataTransfer: { files: fileList } }, ...keys, preventDefault() {}, stopPropagation() {} })
  // Browsers clear access to DataTransfer.files after the drop event returns.
  fileList.length = 0
  resolveMeta({ isMacOS })
  await new Promise(resolve => setImmediate(resolve))
  return events
}

for (const isMacOS of [true, false]) {
  test(`${isMacOS ? 'macOS' : 'Windows'} keeps dropped files while awaiting metadata and honors its modifier`, async () => {
    const file = { name: 'example.TORRENT', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    const events = await drop([file], isMacOS, isMacOS ? { altKey: true } : { ctrlKey: true })
    const upload = events.find(([name]) => name === 'torrents:add')
    assert.ok(upload)
    assert.equal(upload[1].filename, file.name)
    assert.equal(upload[1].sourcePath, '/downloads/example.TORRENT')
    assert.deepEqual(Array.from(upload[1].data), [1, 2, 3])
    assert.equal(upload[2], true)
  })
}

test('one unreadable dropped torrent reports its error without discarding another torrent', async () => {
  const events = await drop([
    { name: 'missing.torrent', arrayBuffer: async () => { throw new Error('File was removed') } },
    { name: 'valid.torrent', arrayBuffer: async () => new ArrayBuffer(1) },
  ], true)
  assert.equal(events.filter(([name]) => name === 'torrents:add').length, 1)
  assert.equal(events.find(([name]) => name === 'torrents:add')[1].filename, 'valid.torrent')
  const notification = events.find(([name]) => name === 'notification')[1]
  assert.match(notification.message, /missing.torrent: File was removed/)
})
