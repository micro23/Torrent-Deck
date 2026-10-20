import { execFile as execFileCallback } from 'child_process'
import { mkdtemp, readdir, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFile = promisify(execFileCallback)

const appIdentifier = 'com.github.micro23.torrentdeck'
const requiredEntitlements = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
]
const helperIdentifiers = new Map([
  ['Torrent-Deck Helper.app', `${appIdentifier}.helper`],
  ['Torrent-Deck Helper (GPU).app', `${appIdentifier}.helper.GPU`],
  ['Torrent-Deck Helper (Plugin).app', `${appIdentifier}.helper.Plugin`],
  ['Torrent-Deck Helper (Renderer).app', `${appIdentifier}.helper.Renderer`],
])
const archiveArchitectures = new Map([
  ['universal', new Set(['arm64', 'x86_64'])],
  ['arm64', new Set(['arm64'])],
  ['x64', new Set(['x86_64'])],
])

async function codesign(args) {
  return execFile('codesign', args, { maxBuffer: 1024 * 1024 })
}

async function command(commandName, args) {
  return execFile(commandName, args, { maxBuffer: 1024 * 1024 })
}

async function appBundles(directory) {
  const bundles = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const entryPath = path.join(directory, entry.name)
    if (entry.name.endsWith('.app')) {
      bundles.push(entryPath)
    }
    bundles.push(...await appBundles(entryPath))
  }

  return bundles
}

function assertIncludes(output, expected, description) {
  if (!output.includes(expected)) {
    throw new Error(`Invalid macOS signature: expected ${description} (${expected})`)
  }
}

async function verifySignature(bundlePath, expectedIdentifier) {
  const { stderr } = await codesign(['--display', '--verbose=2', bundlePath])

  assertIncludes(stderr, `Identifier=${expectedIdentifier}`, 'bundle identifier')
  await codesign(['--verify', '--strict', '--verbose=2', bundlePath])
}

async function verifyEntitlements(appPath) {
  const { stdout, stderr } = await codesign(['--display', '--entitlements', ':-', appPath])
  const entitlements = `${stdout}\n${stderr}`

  for (const entitlement of requiredEntitlements) {
    const escapedEntitlement = entitlement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const enabledEntitlement = new RegExp(
      `<key>\\s*${escapedEntitlement}\\s*</key>\\s*<true\\s*/>`,
    )
    if (!enabledEntitlement.test(entitlements)) {
      throw new Error(`Invalid macOS signature: expected enabled runtime entitlement (${entitlement})`)
    }
  }

  if (entitlements.includes('<key>com.apple.security.app-sandbox</key>')) {
    throw new Error('Invalid macOS signature: App Sandbox must not be enabled')
  }
}

export async function verifyMacosSigning(appPath) {
  await verifySignature(appPath, appIdentifier)
  await verifyEntitlements(appPath)

  const nestedApps = (await appBundles(path.join(appPath, 'Contents')))
    .filter((bundlePath) => bundlePath !== appPath)

  if (nestedApps.length !== helperIdentifiers.size) {
    throw new Error(`Invalid macOS package: expected ${helperIdentifiers.size} nested helper applications`)
  }

  for (const nestedApp of nestedApps) {
    const identifier = helperIdentifiers.get(path.basename(nestedApp))
    if (!identifier) {
      throw new Error(`Invalid macOS package: unexpected nested helper ${nestedApp}`)
    }
    await verifySignature(nestedApp, identifier)
  }

  await codesign(['--verify', '--deep', '--strict', '--verbose=2', appPath])
  console.log(`Verified signature for ${appPath} and ${nestedApps.length} nested helper applications`)
}

async function verifyArchitectures(appPath, expectedArchitectures) {
  const executablePath = path.join(appPath, 'Contents', 'MacOS', 'torrent-deck')
  const { stdout } = await command('lipo', ['-archs', executablePath])
  const actualArchitectures = new Set(stdout.trim().split(/\s+/))

  if (
    actualArchitectures.size !== expectedArchitectures.size
    || [...expectedArchitectures].some((architecture) => !actualArchitectures.has(architecture))
  ) {
    throw new Error(
      `Invalid macOS package: expected architectures ${[...expectedArchitectures].join(', ')}`
      + ` but found ${[...actualArchitectures].join(', ')}`,
    )
  }
}

async function verifyZip(archivePath, expectedArchitectures) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'torrent-deck-signing-'))

  try {
    await command('ditto', ['-x', '-k', archivePath, directory])
    const apps = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    if (apps.length !== 1) {
      throw new Error(`Invalid macOS package: expected one application in ZIP, found ${apps.length}`)
    }
    const appPath = path.join(directory, apps[0].name)
    await verifyMacosSigning(appPath)
    await verifyArchitectures(appPath, expectedArchitectures)
    console.log(`Verified packaged macOS application in ${archivePath}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export default async function(context) {
  if (process.platform !== 'darwin') {
    return []
  }

  for (const archivePath of context.artifactPaths.filter((artifactPath) => artifactPath.endsWith('.zip'))) {
    const architecture = [...archiveArchitectures.keys()]
      .find((architecture) => archivePath.endsWith(`-${architecture}.zip`))
    if (!architecture) {
      throw new Error(`Invalid macOS artifact: unknown architecture in ${archivePath}`)
    }
    await verifyZip(archivePath, archiveArchitectures.get(architecture))
  }

  return []
}
