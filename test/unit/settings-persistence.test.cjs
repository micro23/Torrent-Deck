/* eslint-disable @typescript-eslint/no-require-imports -- Use a temporary profile without opening Electron. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createProfile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'torrent-deck-settings-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const config = path.join(directory, 'config.json')
  const geometry = { x: 20, y: 35, width: 1280, height: 840 }
  const original = { ui: { theme: 'darkhand' }, windowsize: geometry }
  fs.writeFileSync(config, JSON.stringify(original))
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync('src/main/lib/settings.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const fileSystem = { ...fs }
  const modules = {
    electron: { app: { getPath: () => directory } },
    fs: fileSystem,
    './electorrent': {},
    '@shared/settings-defaults': { normalizeSettings: value => structuredClone(value) },
  }
  vm.runInNewContext(compiled, { exports, require: name => modules[name] || require(name) })
  return { settings: exports, fileSystem, config, directory, geometry, original }
}

test('failed settings replacement leaves the previous profile and live settings intact', t => {
  const { settings, config, directory, original, fileSystem } = createProfile(t)
  let notifications = 0
  settings.subscribe(() => notifications++)
  fileSystem.renameSync = () => { throw new Error('Simulated write failure') }
  assert.throws(() => settings.saveAll({ ui: { theme: 'light' } }), /Simulated write failure/)
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), original)
  assert.deepEqual(fs.readdirSync(directory), ['config.json'])
  assert.equal(settings.getAllSettings().ui.theme, 'darkhand')
  assert.equal(notifications, 0)

  fileSystem.renameSync = fs.renameSync
  settings.saveAll({ ui: { theme: 'light' } })
  assert.equal(settings.getAllSettings().ui.theme, 'light')
  assert.equal(notifications, 1)
})

test('renderer settings cannot replace window geometry saved by the main process', t => {
  const { settings, config, geometry } = createProfile(t)
  settings.put('windowsize', { ...geometry, width: 1600 })
  settings.saveAll({ ui: { theme: 'light' }, windowsize: geometry })
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), {
    ui: { theme: 'light' }, windowsize: { ...geometry, width: 1600 },
  })
})
