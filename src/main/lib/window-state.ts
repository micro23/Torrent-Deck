import type { BrowserWindow, Rectangle } from 'electron'

export interface StoredWindowState extends Rectangle {
    fullscreen?: boolean
    maximized?: boolean
}

interface WindowStateSettings {
    get: (key: string) => unknown
    put: (key: string, value: unknown) => void
}

const WINDOW_STATE_KEY = 'windowsize'

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value)
}

function restoreDimension(value: unknown, fallback: number, minimum: number) {
    return isInteger(value) && value > 0 ? Math.max(value, minimum) : fallback
}

function containsPoint(area: Rectangle, x: number, y: number) {
    return x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
}

export function supportsWindowPosition(platform: string, ozonePlatform: string, env: NodeJS.ProcessEnv) {
    if (platform !== 'linux') return true
    if (ozonePlatform === 'x11' || ozonePlatform === 'wayland') return ozonePlatform === 'x11'
    return env.XDG_SESSION_TYPE ? env.XDG_SESSION_TYPE !== 'wayland' : !env.WAYLAND_DISPLAY
}

export function getWindowBoundsOptions(
    value: unknown, primary: Rectangle, workAreas: Rectangle[], restorePosition: boolean,
): Partial<Rectangle> {
    const state = isObject(value) ? value : {}
    const width = restoreDimension(state.width, 1200, 320)
    const height = restoreDimension(state.height, 800, 240)
    const { x, y } = state

    if (restorePosition && isInteger(x) && isInteger(y)) {
        // Keep intentional placement across adjacent displays, including negative coordinates.
        if (workAreas.some(area => containsPoint(area, x, y))
            && workAreas.some(area => containsPoint(area, x + width - 1, y + height - 1))) {
            return { x, y, width, height }
        }

        let bestOverlap = 0
        let target = primary
        for (const area of workAreas) {
            const overlapWidth = Math.min(x + width, area.x + area.width) - Math.max(x, area.x)
            const overlapHeight = Math.min(y + height, area.y + area.height) - Math.max(y, area.y)
            const overlap = Math.max(0, overlapWidth) * Math.max(0, overlapHeight)
            if (overlap > bestOverlap) {
                bestOverlap = overlap
                target = area
            }
        }
        if (bestOverlap > 0) {
            const fittedWidth = Math.min(width, target.width)
            const fittedHeight = Math.min(height, target.height)
            return {
                x: Math.max(target.x, Math.min(x, target.x + target.width - fittedWidth)),
                y: Math.max(target.y, Math.min(y, target.y + target.height - fittedHeight)),
                width: fittedWidth,
                height: fittedHeight,
            }
        }
    }

    // Let the window manager place a new window, or one whose former display is gone.
    return { width: Math.min(width, primary.width), height: Math.min(height, primary.height) }
}

export function shouldRestoreFullscreen(value: unknown): boolean {
    return isObject(value) && value.fullscreen === true
}

export function shouldRestoreMaximized(value: unknown): boolean {
    return isObject(value) && value.maximized === true
}

export function getStoredWindowState(settings: Pick<WindowStateSettings, 'get'>): unknown {
    return settings.get(WINDOW_STATE_KEY)
}

export function saveWindowState(window: BrowserWindow, settings: WindowStateSettings) {
    const fullscreen = window.isFullScreen()
    const windowState: StoredWindowState = {
        ...window.getNormalBounds(),
        fullscreen,
        maximized: window.isMaximized(),
    }

    settings.put(WINDOW_STATE_KEY, windowState)
}
