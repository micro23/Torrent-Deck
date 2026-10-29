// Width preferences are weights, never a minimum canvas wider than the viewport.
export function fitColumnWidths(preferred: number[], available: number): number[] {
    const weights = preferred.map(width => Number.isFinite(width) && width > 0 ? width : 80)
    const total = weights.reduce((sum, width) => sum + width, 0)
    return weights.map(width => total ? Math.max(0, available) * width / total : 0)
}
