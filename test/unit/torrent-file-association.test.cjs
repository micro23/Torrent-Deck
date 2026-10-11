/* eslint-disable @typescript-eslint/no-require-imports -- Platform registration is tested without changing host OS defaults. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function setup(platform, { packaged = true, previous, appImage } = {}) {
  const files = new Map(previous ? [['/profile/torrent-file-handler.json', JSON.stringify(previous)]] : [])
  const calls = []; const opened = []
  const modules = {
    // These mocked platform fixtures use POSIX paths even on a Windows test host.
    path: require('node:path').posix,
    electron: { app: { isPackaged: packaged, getVersion: () => '2.19.0', getPath: name => name === 'home' ? '/home/user' : '/profile' }, shell: { openExternal: async url => opened.push(url) } },
    fs: { existsSync: name => files.has(name) || name === '/installed/newer', promises: {
      readFile: async name => { if (!files.has(name)) throw Error('missing'); return files.get(name) },
      writeFile: async (name, value) => files.set(name, value), mkdir: async () => {},
    } },
    util: { promisify: () => async (command, args) => {
      calls.push({ command, args });
      return { stdout: command === 'powershell.exe' ? 'choose-in-settings\n' : args[0] === 'query' ? 'com.github.micro23.torrentdeck.desktop\n' : '' }
    } },
  }
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync('src/main/lib/torrent-file-association.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(compiled, { exports, Buffer, Error, process: { platform, execPath: '/Applications/Torrent-Deck.app/Contents/MacOS/torrent-deck', resourcesPath: '/resources', env: appImage ? { APPIMAGE: appImage } : {} }, require: name => modules[name] || require(name) })
  return { api: exports, files, calls, opened }
}

test('development Electron never claims torrent files', async () => {
  const f = setup('darwin', { packaged: false })
  assert.equal(await f.api.reclaimTorrentFileAssociation(), 'development')
  assert.equal(f.calls.length, 0)
})
test('macOS registers the actual installed bundle and records its version', async () => {
  const f = setup('darwin')
  await f.api.reclaimTorrentFileAssociation()
  assert.equal(f.calls[0].args.at(-1), '/Applications/Torrent-Deck.app')
  assert.match(f.calls[0].args[3], /setDefaultApplicationAtURLToOpenContentTypeCompletionHandler/)
  assert.match(f.calls[0].args[3], /if \(!isSelected\(\)\) throw/)
  assert.equal(JSON.parse(f.files.get('/profile/torrent-file-handler.json')).version, '2.19.0')
})
test('an older copy does not replace an installed newer handler', async () => {
  const f = setup('darwin', { previous: { version: '2.20.0', executable: '/installed/newer' } })
  assert.equal(await f.api.reclaimTorrentFileAssociation(), 'newer-version')
  assert.equal(f.calls.length, 0)
})
test('Linux uses the persistent AppImage and safely quotes desktop executable paths', async () => {
  const f = setup('linux', { appImage: '/home/user/Torrent Deck 100%.AppImage' })
  await f.api.reclaimTorrentFileAssociation()
  const desktop = f.files.get('/home/user/.local/share/applications/com.github.micro23.torrentdeck.desktop')
  assert.match(desktop, /Exec="\/home\/user\/Torrent Deck 100%%\.AppImage" %F/)
  assert.equal(f.calls[0].args[2], 'application/x-bittorrent')
})
test('Windows registers its executable, preserves UserChoice, and prompts only once', async () => {
  const f = setup('win32')
  await f.api.reclaimTorrentFileAssociation()
  await f.api.reclaimTorrentFileAssociation()
  assert.equal(f.opened.length, 1)
  const script = Buffer.from(f.calls[0].args.at(-1), 'base64').toString('utf16le')
  assert.match(script, /TorrentDeck\.torrent/)
  assert.match(script, /HKCU:\\Software\\Classes/)
  assert.match(script, /Get-ItemProperty[^\n]+UserChoice/)
  assert.doesNotMatch(script, /(?:Set-Item|New-Item|Remove-Item)[^\n]+UserChoice/)
})
