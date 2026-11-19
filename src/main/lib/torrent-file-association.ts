import { app, shell } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import semver from 'semver'
import { promisify } from 'util'

const executeFile = promisify(execFile)

// Use macOS's bundled JavaScript bridge so installed apps need no extra runtime.
// Resolve the extension too: existing installations may have a dynamic UTI.
const reclaimTorrentScript = `
ObjC.import('Foundation');
ObjC.import('CoreServices');
ObjC.import('AppKit');
function run(argv) {
    var bundle = $.NSBundle.bundleWithPath(argv[0]);
    var bundleId = ObjC.unwrap(bundle.bundleIdentifier);
    if (!bundleId) throw new Error('Application bundle has no identifier');
    var registration = $.LSRegisterURL(bundle.bundleURL, true);
    if (registration !== 0) throw new Error('Launch Services registration failed: ' + registration);
    $.NSBundle.bundleWithPath('/System/Library/Frameworks/UniformTypeIdentifiers.framework').load;
    var typeClass = $.NSClassFromString('UTType');
    if (!typeClass) throw new Error('This macOS version does not support default app setup. Use Finder Get Info → Open with → Torrent-Deck → Change All.');
    var workspace = $.NSWorkspace.sharedWorkspace;
    var types = [typeClass.typeWithFilenameExtension($('torrent')), typeClass.typeWithIdentifier($('org.bittorrent.torrent'))];
    var bundlePath = ObjC.unwrap(bundle.bundleURL.URLByResolvingSymlinksInPath.path);
    types.forEach(function(type) {
        if (!type) return;
        function isSelected() {
            var selected = workspace.URLForApplicationToOpenContentType(type);
            return selected && ObjC.unwrap(selected.URLByResolvingSymlinksInPath.path) === bundlePath;
        }
        if (isSelected()) return;
        workspace.setDefaultApplicationAtURLToOpenContentTypeCompletionHandler(bundle.bundleURL, type, null);
        var deadline = Date.now() + 10000;
        while (!isSelected() && Date.now() < deadline) {
            $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
        }
        if (!isSelected()) throw new Error('macOS has not selected Torrent-Deck yet. Confirm its default-app prompt, or use Finder Get Info → Open with → Torrent-Deck → Change All.');
    });
    return bundlePath;
}
`

const FILE_PROG_ID = 'TorrentDeck.torrent'
const LINUX_ICON_NAME = 'com.github.micro23.torrentdeck'
const DESKTOP_ID = `${LINUX_ICON_NAME}.desktop`

function powershellLiteral(value: string) {
    return "'" + value.replace(/'/g, "''") + "'"
}

export function desktopExec(executable: string) {
    if (/[\r\n]/.test(executable)) throw new Error('Invalid application path')
    return '"' + executable.replace(/[\\"`$]/g, '\\$&').replace(/%/g, '%%') + '" %F'
}

export async function reclaimTorrentFileAssociation(force = false): Promise<string> {
    if (!app.isPackaged) {
        if (force) throw new Error('Install the packaged Torrent-Deck app to register torrent files.')
        return 'development'
    }
    const marker = path.join(app.getPath('userData'), 'torrent-file-handler.json')
    try {
        const previous = JSON.parse(await fs.promises.readFile(marker, 'utf8'))
        if (semver.valid(previous.version) && semver.gt(previous.version, app.getVersion())
            && typeof previous.executable === 'string' && fs.existsSync(previous.executable)) return 'newer-version'
    } catch { /* First registration, or the recorded installation was removed. */ }

    let result = 'registered'
    let registeredExecutable = process.execPath
    if (process.platform === 'darwin') {
        const bundlePath = path.resolve(path.dirname(process.execPath), '..', '..')
        await executeFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', reclaimTorrentScript, bundlePath], {
            timeout: 25000, maxBuffer: 64 * 1024,
        })
    } else if (process.platform === 'win32') {
        // Register capabilities and an executable-specific handler; never alter Windows UserChoice hashes.
        const script = String.raw`
$ErrorActionPreference = 'Stop'
$exe = ${powershellLiteral(process.execPath)}
$prog = ${powershellLiteral(FILE_PROG_ID)}
$classes = 'HKCU:\Software\Classes'
$capabilities = 'HKCU:\Software\Torrent-Deck\Capabilities'
New-Item -Path "$classes\$prog\shell\open\command" -Force | Out-Null
Set-Item -Path "$classes\$prog" -Value 'Torrent-Deck Torrent'
Set-Item -Path "$classes\$prog\shell\open\command" -Value ('"' + $exe + '" "%1"')
New-Item -Path "$classes\$prog\DefaultIcon" -Force | Out-Null
Set-Item -Path "$classes\$prog\DefaultIcon" -Value ('"' + $exe + '",0')
New-Item -Path "$classes\.torrent\OpenWithProgids" -Force | Out-Null
New-ItemProperty -Path "$classes\.torrent\OpenWithProgids" -Name $prog -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$capabilities\FileAssociations" -Force | Out-Null
New-ItemProperty -Path $capabilities -Name ApplicationName -Value 'Torrent-Deck' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $capabilities -Name ApplicationDescription -Value 'Manage torrents with Torrent-Deck' -PropertyType String -Force | Out-Null
New-ItemProperty -Path "$capabilities\FileAssociations" -Name '.torrent' -Value $prog -PropertyType String -Force | Out-Null
New-Item -Path 'HKCU:\Software\RegisteredApplications' -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\RegisteredApplications' -Name 'Torrent-Deck' -Value 'Software\Torrent-Deck\Capabilities' -PropertyType String -Force | Out-Null
$choice = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.torrent\UserChoice' -ErrorAction SilentlyContinue
if ($choice.ProgId -eq $prog) { 'registered' } else { 'choose-in-settings' }
`
        const encoded = Buffer.from(script, 'utf16le').toString('base64')
        const response = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeout: 10000 })
        result = response.stdout.trim()
        const prompted = path.join(app.getPath('userData'), 'torrent-default-apps-prompted')
        if (result === 'choose-in-settings' && (force || !fs.existsSync(prompted))) {
            await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Torrent-Deck')
            await fs.promises.writeFile(prompted, '')
        }
    } else if (process.platform === 'linux') {
        const dataHome = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share')
        const applications = path.join(dataHome, 'applications')
        registeredExecutable = process.env.APPIMAGE || (process.env.SNAP ? '/snap/bin/torrent-deck' : process.execPath)
        // AppImage resources live on a mount that goes away when the app exits.
        const icons = path.join(dataHome, 'icons', 'hicolor', '256x256', 'apps')
        await fs.promises.mkdir(icons, { recursive: true })
        await fs.promises.copyFile(path.join(process.resourcesPath, 'torrent-deck.png'), path.join(icons, `${LINUX_ICON_NAME}.png`))
        const desktop = `[Desktop Entry]\nType=Application\nName=Torrent-Deck\nExec=${desktopExec(registeredExecutable)}\nIcon=${LINUX_ICON_NAME}\nTerminal=false\nCategories=Network;FileTransfer;P2P;\nMimeType=application/x-bittorrent;x-scheme-handler/magnet;\n`
        await fs.promises.mkdir(applications, { recursive: true })
        await fs.promises.writeFile(path.join(applications, DESKTOP_ID), desktop)
        await executeFile('xdg-mime', ['default', DESKTOP_ID, 'application/x-bittorrent'], { timeout: 10000 })
        const current = await executeFile('xdg-mime', ['query', 'default', 'application/x-bittorrent'], { timeout: 10000 })
        if (current.stdout.trim() !== DESKTOP_ID) throw new Error('Your desktop did not set Torrent-Deck as the torrent handler. Use Open With → Torrent-Deck.')
    }
    await fs.promises.writeFile(marker, JSON.stringify({ version: app.getVersion(), executable: registeredExecutable }))
    return result
}
