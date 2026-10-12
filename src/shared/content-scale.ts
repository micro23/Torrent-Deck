export const DEFAULT_CONTENT_SCALE = 80
export const MIN_CONTENT_SCALE = 50
export const MAX_CONTENT_SCALE = 130

export function normalizeContentScale(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONTENT_SCALE
    return Math.max(MIN_CONTENT_SCALE, Math.min(MAX_CONTENT_SCALE, Math.round(value / 10) * 10))
}
