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

// Keep the divider tied to its column while respecting the actual fitted minimums.
// When the adjacent column runs out of space, borrow from the rest of that side.
export function resizeFittedColumn(widths: number[], minimum: number[], fixed: boolean[], index: number, delta: number): number[] {
    const result = widths.slice()
    if (index < 0 || index >= widths.length || fixed[index] || !Number.isFinite(delta) || delta === 0) return result

    const first = index === widths.length - 1 ? index - 1 : index + 1
    const step = first < index ? -1 : 1
    const neighbors: number[] = []
    for (let i = first; i >= 0 && i < widths.length; i += step) {
        if (!fixed[i]) neighbors.push(i)
    }
    if (neighbors.length === 0) return result

    if (delta < 0) {
        const released = Math.min(-delta, Math.max(0, widths[index] - minimum[index]))
        const sideWidth = neighbors.reduce((sum, i) => sum + widths[i], 0)
        result[index] -= released
        for (const i of neighbors) result[i] += sideWidth > 0 ? released * widths[i] / sideWidth : released / neighbors.length
    } else {
        let remaining = delta
        for (const i of neighbors) {
            const borrowed = Math.min(remaining, Math.max(0, widths[i] - minimum[i]))
            result[i] -= borrowed
            result[index] += borrowed
            remaining -= borrowed
            if (remaining <= 0) break
        }
    }
    return result
}
