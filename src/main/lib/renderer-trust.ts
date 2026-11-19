import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function isAppRenderer(event: IpcMainInvokeEvent, window: BrowserWindow | null, entry: string) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false
    const frame = event.senderFrame
    if (!frame || frame !== window.webContents.mainFrame) return false
    try {
        const url = new URL(frame.url)
        url.hash = ''
        return url.href === pathToFileURL(path.join(__dirname, entry)).href
    } catch {
        return false
    }
}

export function isExternalLink(value: unknown): value is string {
    if (typeof value !== 'string') return false
    try {
        const url = new URL(value)
        return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
    } catch {
        return false
    }
}
