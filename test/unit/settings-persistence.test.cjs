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

const windowState = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/lib/window-state.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: windowState })
const primary = { x: 0, y: 24, width: 1366, height: 710 }
const external = { x: -1920, y: -100, width: 1920, height: 1080 }
function restore(state, areas = [primary], position = true) {
  return { ...windowState.getWindowBoundsOptions(state, primary, areas, position) }
}

test('window restore preserves usable negative coordinates and spanning windows', () => {
  for (const bounds of [
    { x: -1770, y: -50, width: 1000, height: 680 },
    { x: -470, y: 80, width: 1000, height: 460 },
  ]) assert.deepEqual(restore(bounds, [primary, external]), bounds)
})

test('restoring on a smaller or disconnected display keeps the window within the work area', () => {
  assert.deepEqual(restore({ x: -1850, y: 0, width: 1700, height: 900 }),
    { width: 1366, height: 710 })
  assert.deepEqual(restore({ x: 1250, y: -400, width: 960, height: 1200 }),
    { x: 406, y: 24, width: 960, height: 710 })
  assert.deepEqual(restore({ x: -2100, y: -100, width: 1200, height: 800 }, [primary, external]),
    { x: -1920, y: -100, width: 1200, height: 800 })
})

test('invalid saved geometry falls back to usable dimensions and native placement', () => {
  assert.deepEqual(restore({ x: NaN, y: -1, width: -900, height: Infinity }), { width: 1200, height: 710 })
  assert.deepEqual(restore({ x: 100, width: 1, height: 1 }), { width: 320, height: 240 })
})

test('native Wayland leaves placement to the compositor and XWayland honors saved positions', () => {
  const session = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-1' }
  for (const ozone of ['', 'auto', 'wayland']) {
    const position = windowState.supportsWindowPosition('linux', ozone, session)
    assert.equal(position, false)
    assert.deepEqual(restore({ x: 0, y: 0, width: 900, height: 600 }, [primary, external], position),
      { width: 900, height: 600 })
  }
  assert.equal(windowState.supportsWindowPosition('linux', 'x11', session), true)
  assert.equal(windowState.supportsWindowPosition('darwin', '', {}), true)
})
