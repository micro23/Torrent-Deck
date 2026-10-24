/* eslint-disable @typescript-eslint/no-require-imports -- Exercise settings initialization and failed saves without Electron. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function flush() {
  await new Promise(resolve => setImmediate(resolve))
}

function settingsPage(save = async () => {}) {
  let resolve, reject, writes = 0
  const ready = new Promise((yes, no) => { resolve = yes; reject = no })
  const server = { id: 'server', isConnected: true, equals: () => true }
  const scope = { $on() {}, $applyAsync() {}, $emit() {} }
  const bridge = { settings: { listThemes: async () => [] }, app: {
    getMeta: async () => ({ versions: {} }), getDefaultProtocolStatus: async () => false,
    setDefaultProtocolStatus: async () => {},
  } }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/settings-page/settings-page.controller.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, window: { electorrent: bridge }, angular: { copy: value => ({ ...value }) }, console: { error() {} } })
  new exports.SettingsPageController({ $server: server, $broadcast() {} }, scope, {}, {}, [], {
    whenReady: () => ready, getAllSettingsCopy: () => ({ servers: [server] }),
    saveAllSettings: async () => { writes++; await save() },
  }, { ok() {}, alert() {} })
  return { scope, resolve, reject, writes: () => writes }
}

test('settings cannot be saved before stored values finish loading', async () => {
  const page = settingsPage()
  page.scope.save()
  await flush()
  assert.equal(page.writes(), 0)
  assert.equal(page.scope.settingsReady, false)
  page.resolve()
  await flush()
  assert.equal(page.scope.settingsReady, true)
  page.scope.save()
  page.scope.save()
  await flush()
  assert.equal(page.writes(), 1, 'duplicate Save clicks must not start parallel writes')
})

test('failed settings loads stay visible and cannot overwrite stored configuration', async () => {
  const page = settingsPage()
  page.reject(new Error('Read failed'))
  await flush()
  assert.equal(page.scope.settingsReady, false)
  assert.match(page.scope.settingsError, /Unable to load/)
  page.scope.save()
  assert.equal(page.writes(), 0)
})

test('a failed settings write allows the user to retry', async () => {
  const page = settingsPage(async () => { throw Error('Disk full') })
  page.resolve()
  await flush()
  page.scope.save()
  await flush()
  assert.equal(page.scope.saving, false)
  assert.equal(page.scope.settingsReady, true)
  page.scope.save()
  await flush()
  assert.equal(page.writes(), 2)
})
