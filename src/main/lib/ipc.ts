import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import is from 'electron-is'

import { IPC_CHANNELS } from '@shared/ipc'
import type { AppSettings, EditCommand, PendingTorrentUploadLink, WindowCommand } from '@shared/ipc-contract'
import { getAppVersion } from './app-meta'
import { bittorrentManager } from './bittorrent'
import { normalizeConnectionError } from './bittorrent/connection-error'
import logger from './logger'
import * as certificates from './certificates'
import * as menu from './menu'
import * as settings from './settings'
import themes, { getSystemTheme } from './themes'
import * as torrents from './torrents'
import * as updater from './update'
import { reclaimTorrentFileAssociation } from './torrent-file-association'
import { isAppRenderer, isExternalLink } from './renderer-trust'

interface RegisterHandlersOptions {
    isDebug: boolean
    forceTitleBarMenu?: boolean
    getWindow: () => BrowserWindow | null
    consumePendingLaunchPayload: () => Promise<{
        magnets: PendingTorrentUploadLink[]
        torrentFiles: unknown[]
    }>
    onSettingsSaved?: (settings: AppSettings) => void | Promise<void>
    onSystemThemeChanged?: () => void
    onBittorrentConnected?: () => void | Promise<void>
}

function getAppMeta(isDebug: boolean, requestedForceTitleBarMenu = false) {
    return {
        appName: app.name,
        appVersion: getAppVersion(),
        isMacOS: is.macOS(),
        isWindows: is.windows(),
        isLinux: is.linux(),
        isDebug,
        forceTitleBarMenu: requestedForceTitleBarMenu,
        platform: process.platform,
        versions: {
            node: process.versions.node,
            chrome: process.versions.chrome,
            electron: process.versions.electron,
        },
    }
}

function getCommandWindow(event: IpcMainInvokeEvent, getWindow: () => BrowserWindow | null) {
    const eventWindow = BrowserWindow.fromWebContents(event.sender)
    if (eventWindow && !eventWindow.isDestroyed()) {
        return eventWindow
    }

    const window = getWindow()
    return window && !window.isDestroyed() ? window : null
}

function runWindowCommand(window: BrowserWindow, command: WindowCommand) {
    switch (command) {
        case 'reload':
            window.reload()
            break
        case 'toggle-full-screen':
            window.setFullScreen(!window.isFullScreen())
            break
        case 'toggle-dev-tools':
            window.webContents.toggleDevTools()
            break
        case 'minimize':
            window.minimize()
            break
        case 'close':
            window.close()
            break
        default:
            break
    }
}

function runEditCommand(window: BrowserWindow, command: EditCommand) {
    switch (command) {
        case 'undo':
            window.webContents.undo()
            break
        case 'redo':
            window.webContents.redo()
            break
        case 'cut':
            window.webContents.cut()
            break
        case 'copy':
            window.webContents.copy()
            break
        case 'paste':
            window.webContents.paste()
            break
        default:
            break
    }
}

export function registerHandlers({ isDebug, forceTitleBarMenu, getWindow, consumePendingLaunchPayload, onSettingsSaved, onSystemThemeChanged, onBittorrentConnected }: RegisterHandlersOptions) {
    menu.configure({ isDebug })

    const handle = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
        ipcMain.handle(channel, (event, ...args) => {
            if (!isAppRenderer(event, getWindow(), 'index.html')) throw new Error('Unexpected IPC sender')
            return handler(event, ...args)
        })
    }

    handle(IPC_CHANNELS.app.claimTorrentFiles, async function() {
        try {
            const status = await reclaimTorrentFileAssociation(true)
            await dialog.showMessageBox({
                type: 'info', title: 'Torrent-Deck torrent files',
                message: status === 'choose-in-settings'
                    ? 'Choose Torrent-Deck for .torrent files in Windows Default Apps.'
                    : status === 'newer-version'
                        ? 'A newer installed Torrent-Deck version is already registered.'
                        : 'Torrent-Deck is registered to open .torrent files.',
            })
        } catch (error) {
            await dialog.showMessageBox({ type: 'error', title: 'Torrent file setup',
                message: error instanceof Error ? error.message : String(error) })
        }
    })

    handle(IPC_CHANNELS.app.getMeta, async function() {
        return getAppMeta(isDebug, forceTitleBarMenu)
    })

    handle(IPC_CHANNELS.app.getDefaultProtocolStatus, async function(_event: IpcMainInvokeEvent, { protocol }) {
        return app.isDefaultProtocolClient(protocol)
    })

    handle(IPC_CHANNELS.app.setDefaultProtocolStatus, async function(_event: IpcMainInvokeEvent, { protocol, enabled }) {
        if (enabled) {
            app.setAsDefaultProtocolClient(protocol)
        } else {
            app.removeAsDefaultProtocolClient(protocol)
        }
    })

    handle(IPC_CHANNELS.app.quit, async function() {
        app.quit()
    })

    handle(IPC_CHANNELS.app.reportCorruptSettings, async function() {
        settings.showCorruptDialog()
    })

    handle(IPC_CHANNELS.window.command, async function(event: IpcMainInvokeEvent, { command }) {
        if (!isDebug && (command === 'reload' || command === 'toggle-dev-tools')) {
            return
        }

        const window = getCommandWindow(event, getWindow)
        if (window) {
            runWindowCommand(window, command)
        }
    })

    handle(IPC_CHANNELS.edit.command, async function(event: IpcMainInvokeEvent, { command }) {
        const window = getCommandWindow(event, getWindow)
        if (window) {
            runEditCommand(window, command)
        }
    })

    handle(IPC_CHANNELS.clipboard.readText, async function() {
        return clipboard.readText()
    })

    handle(IPC_CHANNELS.clipboard.writeText, async function(_event: IpcMainInvokeEvent, { text }) {
        clipboard.writeText(text)
    })

    handle(IPC_CHANNELS.shell.openExternal, async function(_event: IpcMainInvokeEvent, { url }) {
        if (!isExternalLink(url)) throw new Error('Unsupported external link')
        await shell.openExternal(url)
    })

    handle(IPC_CHANNELS.settings.getAll, async function() {
        return settings.getAllSettings()
    })

    handle(IPC_CHANNELS.settings.saveAll, async function(_event: IpcMainInvokeEvent, { settings: newSettings }) {
        const savedSettings = settings.saveAll(newSettings)
        await onSettingsSaved?.(savedSettings)
    })

    handle(IPC_CHANNELS.menu.getModel, async function() {
        return menu.getModel()
    })

    handle(IPC_CHANNELS.settings.listThemes, async function() {
        return themes()
    })

    handle(IPC_CHANNELS.settings.getSystemTheme, async function() {
        return getSystemTheme()
    })

    nativeTheme.on('updated', function() {
        const window = getWindow()
        if (window && !window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.settings.systemThemeChanged, getSystemTheme())
        }
        onSystemThemeChanged?.()
    })

    handle(IPC_CHANNELS.settings.chooseWatchDirectory, async function(_event: IpcMainInvokeEvent, { currentPath }) {
        const window = getWindow()
        const result = await dialog.showOpenDialog(window || undefined, {
            title: 'Choose Folder to Watch',
            defaultPath: typeof currentPath === 'string' && currentPath ? currentPath : undefined,
            buttonLabel: 'Use Folder',
            properties: ['openDirectory', 'createDirectory'],
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        return result.filePaths[0]
    })

    handle(IPC_CHANNELS.launch.getPending, async function() {
        return consumePendingLaunchPayload()
    })

    handle(IPC_CHANNELS.torrents.openFiles, async function(_event: IpcMainInvokeEvent, { askUploadOptions }) {
        return torrents.browse(askUploadOptions)
    })

    handle(IPC_CHANNELS.torrents.parse, async function(_event: IpcMainInvokeEvent, request) {
        return torrents.parse(request)
    })

    handle(IPC_CHANNELS.bittorrent.connect, async function(event: IpcMainInvokeEvent, { server }) {
        try {
            const connection = await bittorrentManager.connect(event.sender, server)
            if (!connection) {
                return {
                    ok: false,
                    error: {
                        kind: "unknown",
                        message: "Could not connect to client.",
                    },
                }
            }
            await onBittorrentConnected?.()
            return { ok: true, connection }
        } catch (error) {
            const connectionError = normalizeConnectionError(error)
            logger.warn('Bittorrent connection failed', {
                client: server.client, host: server.ip, port: server.port, path: server.path,
                kind: connectionError.kind, code: connectionError.code,
            })
            return { ok: false, error: connectionError }
        }
    })

    handle(IPC_CHANNELS.bittorrent.disconnect, async function(event: IpcMainInvokeEvent) {
        await bittorrentManager.disconnect(event.sender)
    })

    handle(IPC_CHANNELS.bittorrent.getSnapshot, async function(event: IpcMainInvokeEvent, { fullUpdate } = {}) {
        return bittorrentManager.getSnapshot(event.sender, fullUpdate)
    })

    handle(IPC_CHANNELS.bittorrent.addTorrentUrl, async function(event: IpcMainInvokeEvent, request) {
        return bittorrentManager.addTorrentUrl(event.sender, request)
    })

    handle(IPC_CHANNELS.bittorrent.uploadTorrent, async function(event: IpcMainInvokeEvent, request) {
        return bittorrentManager.uploadTorrent(event.sender, request)
    })

    handle(IPC_CHANNELS.bittorrent.invokeAction, async function(event: IpcMainInvokeEvent, request) {
        return bittorrentManager.invokeAction(event.sender, request)
    })

    handle(IPC_CHANNELS.bittorrent.getActions, async function(event: IpcMainInvokeEvent) {
        return bittorrentManager.getActions(event.sender)
    })

    handle(IPC_CHANNELS.bittorrent.setSelectedTorrents, async function(event: IpcMainInvokeEvent, { ids }) {
        bittorrentManager.setSelectedTorrents(event.sender, ids)
    })

    handle(IPC_CHANNELS.bittorrent.getTorrentDetails, async function(event: IpcMainInvokeEvent, { id }) {
        return bittorrentManager.getTorrentDetails(event.sender, id)
    })

    handle(IPC_CHANNELS.bittorrent.getTorrentFiles, async function(event: IpcMainInvokeEvent, { id }) {
        return bittorrentManager.getTorrentFiles(event.sender, id)
    })

    handle(IPC_CHANNELS.bittorrent.getTorrentPeers, async function(event: IpcMainInvokeEvent, { id }) {
        return bittorrentManager.getTorrentPeers(event.sender, id)
    })

    handle(IPC_CHANNELS.bittorrent.getTorrentTrackers, async function(event: IpcMainInvokeEvent, { id }) {
        return bittorrentManager.getTorrentTrackers(event.sender, id)
    })

    handle(IPC_CHANNELS.bittorrent.addTorrentTracker, async function(event: IpcMainInvokeEvent, { id, url }) {
        return bittorrentManager.addTorrentTracker(event.sender, id, url)
    })

    handle(IPC_CHANNELS.bittorrent.editTorrentTracker, async function(event: IpcMainInvokeEvent, { id, url, newUrl }) {
        return bittorrentManager.editTorrentTracker(event.sender, id, url, newUrl)
    })

    handle(IPC_CHANNELS.bittorrent.removeTorrentTracker, async function(event: IpcMainInvokeEvent, { id, url }) {
        return bittorrentManager.removeTorrentTracker(event.sender, id, url)
    })

    handle(IPC_CHANNELS.bittorrent.setTorrentFileSelection, async function(event: IpcMainInvokeEvent, request) {
        return bittorrentManager.setTorrentFileSelection(event.sender, request)
    })

    handle(IPC_CHANNELS.bittorrent.setTorrentFilePriority, async function(event: IpcMainInvokeEvent, request) {
        return bittorrentManager.setTorrentFilePriority(event.sender, request)
    })

    handle(IPC_CHANNELS.updates.check, async function(_event: IpcMainInvokeEvent, { verbose }) {
        updater.checkForUpdates(verbose)
    })

    handle(IPC_CHANNELS.updates.download, async function() {
        updater.downloadUpdateAfterApproval()
    })

    handle(IPC_CHANNELS.updates.installDownloaded, async function() {
        updater.manualQuitAndUpdate()
    })

    handle(IPC_CHANNELS.updates.installAuto, async function() {
        updater.quitAndInstall()
    })

    handle(IPC_CHANNELS.certificates.fetch, async function(_event: IpcMainInvokeEvent, request) {
        return new Promise((resolve, reject) => {
            certificates.get(request.server, function(err: Error, cert: unknown) {
                if (err) {
                    reject(err)
                    return
                }

                const window = getWindow()
                if (window && !window.isDestroyed()) {
                    window.webContents.send(IPC_CHANNELS.certificates.challenge, cert)
                }

                resolve(cert)
            })
        })
    })

    handle(IPC_CHANNELS.certificates.install, async function(_event: IpcMainInvokeEvent, request) {
        return new Promise((resolve, reject) => {
            certificates.installCertificate(request, function(err: Error, fingerprint: string) {
                if (err) reject(err)
                else resolve({ fingerprint })
            })
        })
    })

    handle(IPC_CHANNELS.certificates.load, async function(_event: IpcMainInvokeEvent, { fingerprint }) {
        const cert = certificates.loadCertificate(fingerprint)
        return cert ? new Uint8Array(cert) : null
    })
}
