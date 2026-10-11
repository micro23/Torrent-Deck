import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import fs from 'fs'
import path from 'path'
import request from 'request'
import semver from 'semver'

import { IPC_CHANNELS } from '@shared/ipc'
import * as electorrent from './electorrent'
import logger from './logger'

const RELEASES_URL = 'https://github.com/micro23/Torrent-Deck/releases'
const UPDATE_CONNECTION_ERROR = 'Could not check version automatically. Please visit the website instead'
const version = app.getVersion()

// Only explicit --update-url overrides use the legacy JSON downloader (local tests).
let updateUrl: string | undefined
let mainWindow: BrowserWindow | null = null
let update: any = null
let downloadedUpdate: string | null = null
let pendingManualDownloadUrl: string | null = null
let verbose = false
let manualMacUpdates = false

export function setWindow(window: BrowserWindow) {
    mainWindow = window
}

export function checkForUpdates(notifyVerbose: boolean) {
    verbose = notifyVerbose === true

    if (updateUrl) {
        manualUpdater()
        return
    }
    if (!app.isPackaged) {
        if (verbose) {
            sendUpdateStatus({ type: 'error', message: 'Automatic updates are available in installed releases.' })
        }
        return
    }
    if (manualMacUpdates) {
        manualMacUpdater()
        return
    }
    // Snap installations are updated by snapd, rather than an in-app installer.
    if (process.env.SNAP) {
        if (verbose) {
            sendUpdateStatus({ type: 'error', message: 'This Snap installation is updated by the Snap package manager.' })
        }
        return
    }
    void autoUpdater.checkForUpdates().catch((error: Error) => {
        // electron-updater also emits the error event, which updates the UI.
        logger.error('GitHub update check failed', error)
    })
}

export function initialise(initWindow: BrowserWindow, customUpdateUrl?: string) {
    setWindow(initWindow)
    updateUrl = customUpdateUrl
    if (app.isPackaged && process.platform === 'darwin') {
        const metadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))
        manualMacUpdates = metadata.manualMacUpdates === true
    }
    if (updateUrl || manualMacUpdates) {
        manualDownloader()
    } else {
        githubUpdater()
    }
}

export function manualQuitAndUpdate() {
    if (!downloadedUpdate) return
    const updatePath = downloadedUpdate

    if (path.extname(updatePath).toLowerCase() === '.zip') {
        void shell.openPath(updatePath).then((error) => {
            if (!error) return
            logger.error('Could not open downloaded macOS update', error)
            notifyConnectionError()
            dialog.showErrorBox('Could not open update', `Open the downloaded ZIP manually:\n${updatePath}`)
        })
        return
    }
    const isExecutable = fs.constants.F_OK | fs.constants.X_OK
    fs.access(updatePath, isExecutable, (err: Error | null) => {
        if (err) {
            logger.error('Error while executing update', err)
            shell.showItemInFolder(updatePath)
        } else {
            shell.openPath(updatePath)
            app.quit()
        }
    })
}

export function quitAndInstall() {
    autoUpdater.quitAndInstall()
}

export function downloadUpdateAfterApproval() {
    if (!update) return
    sendUpdateStatus({ type: 'downloading' })
    if (updateUrl || manualMacUpdates) {
        if (pendingManualDownloadUrl) downloadUpdate(pendingManualDownloadUrl)
        return
    }
    void autoUpdater.downloadUpdate().catch((error: Error) => {
        logger.error('GitHub update download failed', error)
        notifyConnectionError()
    })
}

export function openUpdateFilePath() {
    if (!downloadedUpdate) return
    shell.showItemInFolder(downloadedUpdate)
}

function downloadUpdate(url: string) {
    mainWindow?.webContents.downloadURL(url)
}

function notifyUpdateDownloaded(filePath: string) {
    downloadedUpdate = filePath

    sendUpdateStatus({
        type: 'downloaded',
        data: {
            releaseNotes: update.notes,
            releaseName: update.name,
            releaseDate: update.pub_date,
            updateUrl: update.url,
            manual: true,
            installedVersion: version,
            latestVersion: update.name,
            downloaded: true,
        },
    })
}

function manualDownloader() {
    mainWindow?.webContents.session.on('will-download', (_event, item) => {
        const totalBytes = item.getTotalBytes()
        const filePath = path.join(app.getPath('downloads'), item.getFilename())

        if (totalBytes > 0 && fs.existsSync(filePath) && fs.statSync(filePath).size === totalBytes) {
            item.cancel()
            notifyUpdateDownloaded(filePath)
            return
        }

        item.setSavePath(filePath)

        item.on('updated', () => {
            mainWindow?.setProgressBar(item.getReceivedBytes() / totalBytes)
        })

        item.on('done', (_event, state) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(-1)
            }

            if (state === 'interrupted') {
                logger.error('The download update was interrupted', state)
                dialog.showErrorBox('Download error', `The download of ${item.getFilename()} was interrupted`)
                sendUpdateStatus({ type: 'error', message: 'The update download was interrupted. Check your connection and try again.' })
            }

            if (state === 'completed') {
                notifyUpdateDownloaded(item.getSavePath())
            }
        })
    })
}

function manualUpdater() {
    if (!updateUrl) return
    notifyCheckingUpdate()

    request(updateUrl, function(error: Error | null, response: { statusCode: number }, body: string) {
        if (error) {
            logger.error('Manual updater error', error)
            notifyUpdateError()
            return
        }

        if (response.statusCode === 204) {
            logger.verbose('Manual no new update available', response.statusCode)
            notifyUpToDate()
            return
        }

        if (response.statusCode === 200) {
            logger.verbose('Manual updater found update', response.statusCode)

            const info = JSON.parse(body)
            const newVersion = semver.clean(info.name)
            if (!semver.valid(newVersion)) {
                logger.error('Manual updater invalid semver', info.name)
                return
            }

            if (semver.gt(newVersion, version)) {
                update = info
                pendingManualDownloadUrl = info.url
                notifyUpdateAvailable()
            } else {
                notifyUpToDate(newVersion)
            }
        }
    })
}

function manualMacUpdater() {
    notifyCheckingUpdate()
    request({
        url: 'https://api.github.com/repos/micro23/Torrent-Deck/releases/latest',
        headers: { 'User-Agent': 'Torrent-Deck', Accept: 'application/vnd.github+json' },
        timeout: 15000,
    }, (error: Error | null, response: { statusCode: number }, body: string) => {
        if (error || !response || (response.statusCode !== 200 && response.statusCode !== 404)) {
            notifyConnectionError()
            return
        }
        if (response.statusCode === 404) {
            notifyConnectionError()
            return
        }
        try {
            const release = JSON.parse(body)
            const newVersion = semver.clean(release.tag_name)
            if (!newVersion || !semver.valid(newVersion)) throw new Error('Invalid release version')
            if (!semver.gt(newVersion, version)) {
                notifyUpToDate(newVersion)
                return
            }
            const suffix = process.arch === 'arm64' ? '-macOS-arm64.zip' : '-macOS-universal.zip'
            const asset = release.assets.find((item: { name: string }) => item.name.endsWith(suffix))
                || release.assets.find((item: { name: string }) => item.name.endsWith('-macOS-universal.zip'))
            if (!asset || !asset.browser_download_url.startsWith('https://github.com/micro23/Torrent-Deck/releases/download/')) {
                throw new Error('Release has no compatible macOS ZIP')
            }
            update = { name: newVersion, notes: release.body, pub_date: release.published_at, url: release.html_url }
            pendingManualDownloadUrl = asset.browser_download_url
            notifyUpdateAvailable()
        } catch (error) {
            logger.error('macOS manual update check failed', error)
            notifyConnectionError()
        }
    })
}

function notify({ title = '', message = '', type = 'info' }) {
    const win = electorrent.getWindow()
    if (!win) return

    win.webContents.send(IPC_CHANNELS.notifications.push, {
        title,
        message,
        type,
    })
}

function sendUpdateStatus(payload: unknown) {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const status = payload as { data?: Record<string, unknown> }
    mainWindow.webContents.send(IPC_CHANNELS.updates.status, {
        ...status,
        data: { installedVersion: version, ...status.data },
    })
}

function notifyUpdateError() {
    sendUpdateStatus({
        type: 'error',
        message: 'Could not update Torrent-Deck. Please visit the website instead',
    })
    notify({
        title: 'Update Error',
        message: 'Could not update Torrent-Deck. Please visit the website instead',
        type: 'negative',
    })
}

function notifyCheckingUpdate() {
    if (!verbose) return

    sendUpdateStatus({
        type: 'checking',
    })
    notify({
        title: 'Checking for update',
        message: 'Checking for new updates',
        type: 'info',
    })
}

function notifyUpdateAvailable() {
    sendUpdateStatus({
        type: 'available',
        data: {
            releaseNotes: update && update.notes,
            releaseName: update && update.name,
            releaseDate: update && update.pub_date,
            updateUrl: update && update.url,
            manual: !!updateUrl || manualMacUpdates,
            installedVersion: version,
            latestVersion: update && update.name,
        },
    })
    notify({
        title: 'Update Available!',
        message: 'A newer version is available. Choose Download Update to install it.',
        type: 'info',
    })
}

function notifyUpToDate(latestVersion = version) {
    if (!verbose) return

    sendUpdateStatus({
        type: 'up-to-date',
        data: { latestVersion, updateUrl: RELEASES_URL },
    })
    notify({
        title: 'Up to date!',
        message: 'Your version of Torrent-Deck is up to date',
        type: 'positive',
    })
}

function notifyConnectionError() {
    sendUpdateStatus({
        type: 'error',
        message: UPDATE_CONNECTION_ERROR,
    })
    notify({
        title: 'Update Error',
        message: UPDATE_CONNECTION_ERROR,
        type: 'negative',
    })
}

function releaseData(info: UpdateInfo) {
    return {
        releaseNotes: Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map(note => note.note).filter(Boolean).join('\n\n')
            : info.releaseNotes,
        releaseName: info.releaseName || info.version,
        releaseDate: info.releaseDate,
        updateUrl: RELEASES_URL,
        manual: false,
        installedVersion: version,
        latestVersion: info.version,
    }
}

function githubUpdater() {
    // The packaged app-update.yml is generated from electron-builder.yml.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false

    autoUpdater.on('error', (error: Error) => {
        logger.error('GitHub updater error', error)
        mainWindow?.setProgressBar(-1)
        notifyConnectionError()
    })
    autoUpdater.on('checking-for-update', notifyCheckingUpdate)
    autoUpdater.on('update-not-available', (info: UpdateInfo) => notifyUpToDate(info.version))
    autoUpdater.on('update-available', (info: UpdateInfo) => {
        update = {
            notes: releaseData(info).releaseNotes,
            name: info.version,
            pub_date: info.releaseDate,
            url: RELEASES_URL,
        }
        notifyUpdateAvailable()
    })
    autoUpdater.on('download-progress', (progress) => {
        mainWindow?.setProgressBar(progress.percent / 100)
    })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        mainWindow?.setProgressBar(-1)
        sendUpdateStatus({ type: 'downloaded', data: { ...releaseData(info), downloaded: true } })
    })
}
