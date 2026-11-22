import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import parseTorrent from 'parse-torrent'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
    ParseTorrentRequest,
    PendingTorrentUploadFile,
    PendingTorrentUploadLink,
    TorrentMetadata,
} from '@shared/ipc-contract'
import * as electorrent from './electorrent'
import { readFileVersion, sameFileVersion } from './torrent-source-file'

function notify({ title = '', message = '', type = 'info' }) {
    const win = electorrent.getWindow()
    if (!win) return

    win.webContents.send(IPC_CHANNELS.notifications.push, {
        title,
        message,
        type,
    })
}

function filterFiles(filePath: string) {
    return filePath.toLowerCase().endsWith('.torrent')
}

function sleep(timeout: number) {
    return new Promise((resolve) => setTimeout(resolve, timeout))
}

async function readStableFile(filePath: string, attempts = 6, delay = 250): Promise<Buffer> {
    let previous: fs.Stats | undefined

    for (let index = 0; index < attempts; index += 1) {
        if (index > 0) await sleep(delay)
        const stats = await fs.promises.stat(filePath)
        if (!stats.isFile()) {
            throw new Error('Choose a regular torrent file')
        }
        if (stats.size && previous && sameFileVersion(previous, stats)) {
            const data = await readFileVersion(filePath, stats)
            if (data) return data
        }
        previous = stats
    }
    throw new Error('The torrent file is empty or still changing. Try again after it finishes saving.')
}

export function parse(request: ParseTorrentRequest): TorrentMetadata {
    const source = 'uri' in request ? request.uri : Buffer.from(request.data)
    const parsed = parseTorrent(source)
    const info = 'info' in parsed ? parsed.info as { files?: Array<{ attr?: Buffer }> } : undefined
    const files = (parsed.files || []).map((file, index) => ({
        name: file.name,
        path: file.path,
        length: file.length,
        ...(info?.files?.[index]?.attr?.includes(0x70) ? { padding: true } : {}),
    }))

    return {
        name: parsed.name,
        infoHash: parsed.infoHash,
        length: files.length ? files.reduce((total, file) => total + (file.padding ? 0 : file.length), 0) : parsed.length,
        announce: parsed.announce || [],
        files,
    }
}

export function serializeMagnetLink(uri: string, askUploadOptions = false): PendingTorrentUploadLink {
    const link: PendingTorrentUploadLink = {
        type: 'link',
        uri,
        askUploadOptions,
    }

    try {
        link.metadata = parse({ uri })
    } catch {
        // Invalid links are still passed through so the client can handle them.
    }

    return link
}

export async function serializeTorrentFile(filePath: string, askUploadOptions: boolean): Promise<PendingTorrentUploadFile> {
    const data = await readStableFile(filePath)
    const torrentData = new Uint8Array(data)

    const torrent: PendingTorrentUploadFile = {
        type: 'file',
        filename: path.basename(filePath),
        data: torrentData,
        sourcePath: filePath,
        askUploadOptions: !!askUploadOptions,
    }
    try {
        torrent.metadata = parse({ data: torrentData })
    } catch {
        // Preview parsing must not prevent the server from accepting newer torrent formats.
    }
    return torrent
}

export async function readFiles(filepaths: string[], askUploadOptions: boolean) {
    if (!Array.isArray(filepaths) || filepaths.length === 0) return []

    const torrents = filepaths.filter(filterFiles)

    if (torrents.length === 0) {
        notify({
            title: 'Oopsy Daisy!',
            message: 'Seems like you chose an incorrect file type!',
            type: 'negative',
        })
        return []
    }

    const files = await Promise.all(torrents.map(async (file) => {
        try {
            return await serializeTorrentFile(file, askUploadOptions)
        } catch (error) {
            notify({
                title: 'Could not open torrent file',
                message: `${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
                type: 'negative',
            })
            return null
        }
    }))
    return files.filter((file): file is PendingTorrentUploadFile => file !== null)
}

// Electron >= 43 defaults the dialog to the Downloads folder instead of letting
// the OS restore the last-used directory, so remember it ourselves.
let lastBrowseDirectory: string | undefined

export async function browse(askUploadOptions: boolean) {
    const win = electorrent.getWindow()

    const result = await dialog.showOpenDialog(win, {
        title: 'Open Torrent File',
        defaultPath: lastBrowseDirectory,
        buttonLabel: 'Add Torrent',
        filters: [
            { name: 'Torrent', extensions: ['torrent'] },
        ],
        properties: ['openFile', 'multiSelections'],
    })

    if (result.canceled) {
        return []
    }

    if (result.filePaths.length > 0) {
        lastBrowseDirectory = path.dirname(result.filePaths[0])
    }

    return readFiles(result.filePaths, askUploadOptions)
}
