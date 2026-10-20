/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the renderer icon loader without a browser or external network. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const filename = path.resolve(__dirname, '../../src/renderer/app/directives/tracker-favicon', file + '.ts')
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, URL, require: () => load('favicon-candidates') }, { filename })
  return module.exports
}
const { trackerFaviconCandidates } = load('favicon-candidates')
const { TrackerFaviconDirective } = load('tracker-favicon.directive')

function fixture(host) {
  let watch, destroy
  const images = []
  const classes = new Set()
  const element = {
    0: { ownerDocument: { createElement() {
      const listeners = new Map()
      const img = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name), emit: name => listeners.get(name)?.() }
      images.push(img)
      return img
    } } },
    empty() { return this },
    removeClass(name) { classes.delete(name); return this },
    addClass(name) { classes.add(name); return this },
    prop(name, value) { this[name] = value; return this },
    attr() { return this },
    append() { return this },
  }
  const scope = { $watch(_expression, fn) { watch = fn }, $on(_event, fn) { destroy = fn } }
  new TrackerFaviconDirective().link(scope, element, { trackerFavicon: 'tracker' })
  watch(host)
  return { element, images, classes, change: value => watch(value), destroy: () => destroy() }
}

test('Deluge announce subdomains resolve to the WebUI tracker root before the cache', () => {
  const urls = Array.from(trackerFaviconCandidates('https://user:secret@tracker.torrentleech.org:443/secret-passkey/announce'))
  assert.deepEqual(urls, [
    'https://torrentleech.org/favicon.ico',
    'https://tracker.torrentleech.org/favicon.ico',
    'https://icons.duckduckgo.com/ip3/torrentleech.org.ico',
  ])
  assert.ok(urls.every(url => !url.includes('secret') && !url.includes('passkey')))
})

test('unknown tracker hosts try their own icon, their site root, then the cache', () => {
  assert.deepEqual(Array.from(trackerFaviconCandidates('udp://announce.some-tracker.org:6969/announce')), [
    'https://announce.some-tracker.org/favicon.ico', 'https://some-tracker.org/favicon.ico',
    'https://icons.duckduckgo.com/ip3/some-tracker.org.ico',
  ])
  for (const host of ['localhost', '192.168.1.2', '127.0.0.1', '10.1.1.2', 'host.local', '[::1]', 'not a hostname']) {
    assert.deepEqual(Array.from(trackerFaviconCandidates(host)), [], host)
  }
})

test('a failed tracker endpoint advances to a real cached logo and reveals it on load', () => {
  const f = fixture('https://torrentleech.org/favicon.ico')
  const img = f.images[0]
  assert.equal(img.hidden, true)
  img.emit('error')
  assert.equal(img.src, 'https://icons.duckduckgo.com/ip3/torrentleech.org.ico')
  assert.equal(f.classes.has('tracker-favicon-fallback'), false)
  img.emit('load')
  assert.equal(img.hidden, false)
  assert.equal(img.referrerPolicy, 'no-referrer')
})

test('all failed candidates hide the broken image and show only the neutral network fallback', () => {
  const f = fixture('https://torrentleech.org/favicon.ico')
  const img = f.images[0]
  img.emit('error')
  img.emit('error')
  assert.equal(img.hidden, true)
  assert.equal(f.classes.has('tracker-favicon-fallback'), true)
})

test('a tracker change resets retries and detaches old image events; destruction detaches the current image', () => {
  const f = fixture('https://torrentleech.org/favicon.ico')
  const old = f.images[0]
  f.change('https://announce.some-tracker.org/favicon.ico')
  old.emit('error')
  assert.equal(f.images[1].src, 'https://announce.some-tracker.org/favicon.ico')
  f.destroy()
  f.images[1].emit('error')
  assert.equal(f.images[1].src, 'https://announce.some-tracker.org/favicon.ico')
  f.change('localhost')
  assert.equal(f.element.hidden, true)
})
