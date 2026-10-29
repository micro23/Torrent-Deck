// Width preferences are weights. Readability floors are funded first so a
// stale or deliberately tiny preference cannot collapse a categorical column.
export function fitColumnWidths(preferred: number[], available: number, minimum: number[] = []): number[] {
    const weights = preferred.map(width => Number.isFinite(width) && width > 0 ? width : 80)
    const floors = weights.map((_width, index) => Math.max(0, minimum[index] || 0))
    const budget = Math.max(0, available)
    const floorTotal = floors.reduce((sum, width) => sum + width, 0)
    if (floorTotal > budget) return floors.map(width => budget * width / floorTotal)
    const result = weights.map(() => 0)
    const pending = new Set(weights.map((_width, index) => index))
    let remaining = budget
    while (pending.size) {
        const total = [...pending].reduce((sum, index) => sum + weights[index], 0)
        const constrained = [...pending].filter(index => remaining * weights[index] / total < floors[index])
        if (!constrained.length) {
            pending.forEach(index => { result[index] = remaining * weights[index] / total })
            break
        }
        constrained.forEach(index => { result[index] = floors[index]; remaining -= floors[index]; pending.delete(index) })
    }
    return result
}
