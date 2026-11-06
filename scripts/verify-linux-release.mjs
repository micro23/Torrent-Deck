import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { extractFile } from '@electron/asar'
import yaml from 'js-yaml'

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const dist = path.resolve('dist')
const stem = `Torrent-Deck-${version}-Linux-x64`
// AppImage normalizes the x64 artifact-name macro to x86_64; tar.gz keeps x64.
const image = `Torrent-Deck-${version}-Linux-x86_64.AppImage`
const archive = `${stem}.tar.gz`
const digest = (file, algorithm, encoding) => createHash(algorithm).update(fs.readFileSync(file)).digest(encoding)
const checkExecutable = file => {
  const bytes = fs.readFileSync(file)
  assert.equal(bytes.subarray(0, 4).toString(), '\x7fELF', `${file}: expected ELF executable`)
  assert.equal(bytes.readUInt16LE(18), 62, `${file}: expected x86-64`)
  assert.ok(fs.statSync(file).mode & 0o111, `${file}: expected executable permissions`)
}

checkExecutable(path.join(dist, image))
const extracted = path.join(dist, 'linux-appimage-check')
fs.mkdirSync(extracted, { recursive: true })
execFileSync(path.join(dist, image), ['--appimage-extract'], { cwd: extracted, stdio: 'ignore' })
const root = path.join(extracted, 'squashfs-root')
checkExecutable(path.join(root, 'torrent-deck'))
assert.ok(fs.statSync(path.join(root, 'AppRun')).mode & 0o111)
const asar = path.join(root, 'resources', 'app.asar')
assert.equal(JSON.parse(extractFile(asar, 'package.json').toString()).version, version)
const desktopFiles = fs.readdirSync(root).filter(file => file.endsWith('.desktop'))
assert.equal(desktopFiles.length, 1)
const desktop = fs.readFileSync(path.join(root, desktopFiles[0]), 'utf8')
assert.match(desktop, /application\/x-bittorrent/)
assert.match(desktop, /x-scheme-handler\/magnet/)

const portable = path.join(dist, 'linux-archive-check')
fs.mkdirSync(portable, { recursive: true })
execFileSync('tar', ['-xzf', path.join(dist, archive), '-C', portable])
// electron-builder can place archive contents directly at the root or in a named directory.
const roots = [portable, ...fs.readdirSync(portable, { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => path.join(portable, entry.name))]
const portableRoot = roots.find(directory => fs.existsSync(path.join(directory, 'resources', 'app.asar')))
assert.ok(portableRoot, 'Portable archive must contain the application')
checkExecutable(path.join(portableRoot, 'torrent-deck'))
assert.equal(digest(path.join(portableRoot, 'resources', 'app.asar'), 'sha256', 'hex'), digest(asar, 'sha256', 'hex'))

const metadata = yaml.load(fs.readFileSync(path.join(dist, 'latest-linux.yml'), 'utf8'))
assert.equal(metadata.version, version)
assert.equal(metadata.path, image)
assert.equal(metadata.sha512, digest(path.join(dist, image), 'sha512', 'base64'))
assert.ok(metadata.files.some(file => file.url === image))
for (const file of metadata.files) {
  assert.ok([image, archive].includes(file.url), 'Unexpected updater asset')
  assert.equal(file.sha512, digest(path.join(dist, file.url), 'sha512', 'base64'))
  assert.equal(file.size, fs.statSync(path.join(dist, file.url)).size)
}
fs.writeFileSync(path.join(dist, 'SHA256SUMS-linux.txt'), [image, archive]
  .map(file => `${digest(path.join(dist, file), 'sha256', 'hex')}  ${file}\n`).join(''))
console.log(`Verified Linux x64 ${version}: AppImage, portable archive, desktop entry, ASAR version, and updater checksums`)
