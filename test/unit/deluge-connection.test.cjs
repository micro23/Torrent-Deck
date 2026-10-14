/* eslint-disable @typescript-eslint/no-require-imports -- Isolated processes exercise real HTTP cookies with skewed clocks. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const scenario = String.raw`
const assert = require('node:assert/strict')
const NativeDate = Date
const offset = Number(process.argv[1])
global.Date = class extends NativeDate {
  constructor(...args) { if (args.length) super(...args); else super(NativeDate.now() + offset) }
  static now() { return NativeDate.now() + offset }
}
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const http = require('node:http'), request = require('request')
const methods = []
const server = http.createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rpc = JSON.parse(Buffer.concat(chunks).toString())
  methods.push(rpc.method)
  const now = NativeDate.now()
  res.setHeader('Date', new NativeDate(now).toUTCString())
  res.setHeader('Content-Type', 'application/json')
  if (rpc.method !== 'auth.login' && !/session=accepted/.test(req.headers.cookie || '')) {
    res.end(JSON.stringify({ id: rpc.id, result: null, error: { message: 'Not authenticated', code: 1 } }))
    return
  }
  let result
  switch (rpc.method) {
    case 'auth.login':
      res.setHeader('Set-Cookie', 'session=accepted; Expires=' + new NativeDate(now + 3600000).toUTCString() + '; Path=/; HttpOnly')
      result = true; break
    case 'web.get_hosts': result = [['host', '127.0.0.1', 58846, 'Connected']]; break
    case 'web.connect': result = ['core.add_torrent_magnet']; break
    case 'web.get_host_status': result = ['host', 'Connected', '2.2.0']; break
    case 'core.get_enabled_plugins': result = []; break
    case 'core.get_config_values': result = { download_location: '/downloads' }; break
    case 'core.get_free_space': result = 1024; break
    case 'web.update_ui': result = { torrents: {}, stats: {} }; break
    default: throw new Error('Unexpected RPC method')
  }
  res.end(JSON.stringify({ id: rpc.id, result, error: null }))
})
;(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const exports = {}
    const source = ts.transpileModule(fs.readFileSync('src/main/lib/bittorrent/clients/deluge/index.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, { exports, Buffer, Error, Date, require: name =>
      name === '@main/lib/bittorrent/helpers' ? {
        HTTP_LOGIN_TIMEOUT: 3000, HTTP_REQUEST_TIMEOUT: 3000,
        serverUrl: (s, endpoint) => 'http://127.0.0.1:' + s.port + '/' + endpoint,
        defer: fn => new Promise((resolve, reject) => fn((err, value) => err ? reject(err) : resolve(value))),
      } : require(name),
    })
    const api = new exports.DelugeRuntime()
    const connection = await api.connect({ port: server.address().port, password: 'fixture-password' })
    assert.equal(connection.version, '2.2.0')
    assert.equal(Object.keys((await api.getSnapshot()).torrents).length, 0)
    assert.equal(methods.filter(method => method === 'auth.login').length, 1)
    const cookies = api.requestOptions.jar.getCookies(api.rpcUrl)
    const session = cookies.find(cookie => cookie.key === 'session')
    assert.ok(session, 'login cookie must survive local clock skew')
    assert.ok(Math.abs(session.expires.getTime() - Date.now() - 3600000) < 3000)
    // A deletion must remain expired after translating the server's timestamp.
    const expired = new NativeDate(NativeDate.now() - 60000).toUTCString()
    api.acceptSessionCookies({ headers: { date: new NativeDate().toUTCString(), 'set-cookie': ['session=deleted; Expires=' + expired + '; Path=/'] } })
    if (Math.abs(offset) >= 60000) assert.equal(api.requestOptions.jar.getCookies(api.rpcUrl).length, 0)
  } finally { await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
`

for (const hours of [0, 4, -4]) {
  test(`Deluge connects and refreshes with the computer clock ${hours} hours from the server`, () => {
    const child = spawnSync(process.execPath, ['-e', scenario, '--', String(hours * 3600000)], { encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error))
  })
}

test('Deluge rejected sessions produce a clock-specific error without exposing credentials', () => {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/main/lib/bittorrent/connection-error.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports })
  const result = exports.normalizeConnectionError({ message: 'Not authenticated', code: 'DELUGE_SESSION_EXPIRED' })
  assert.equal(result.kind, 'authentication')
  assert.match(result.message, /date and time/)
})
