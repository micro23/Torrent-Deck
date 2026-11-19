/* eslint-disable @typescript-eslint/no-require-imports -- VM harness loads the shared TypeScript URL helpers. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(filename, modules = {}) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, URL, require: name => modules[name] || require(name) })
  return exports
}

const helpers = load('src/main/lib/bittorrent/helpers.ts', {
  '@shared/server-address': load('src/shared/server-address.ts'),
})

test('invalid saved ports fail instead of silently connecting to localhost', () => {
  assert.throws(() => helpers.serverOriginUrl({ ip: '192.0.2.10', proto: 'http', port: 680016800 }),
    error => error.code === 'ERR_INVALID_URL')
  assert.equal(helpers.serverOriginUrl({ ip: '192.0.2.10', proto: 'http', port: 16800 }), 'http://192.0.2.10:16800')
  assert.equal(helpers.serverOriginUrl({ ip: '::1', proto: 'https', port: 8443 }), 'https://[::1]:8443')
})

test('an explicitly pasted default port overrides the stored nonstandard port', () => {
  assert.equal(helpers.serverOriginUrl({ ip: 'https://seedbox.example:443/web', proto: 'http', port: 8112 }), 'https://seedbox.example')
  assert.equal(helpers.serverOriginUrl({ ip: '[2001:db8::1]:80', proto: 'http', port: 8112 }), 'http://[2001:db8::1]')
  assert.equal(helpers.serverOriginUrl({ ip: 'https://seedbox.example/web', proto: 'http', port: 8112 }), 'https://seedbox.example:8112')
})
