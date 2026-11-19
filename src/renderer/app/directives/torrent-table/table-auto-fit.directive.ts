import { fitColumnWidths, resizeFittedColumn } from '@renderer/app/lib/fit-column-widths'
import type { IAugmentedJQuery, IDirective, IDirectiveFactory, IScope } from 'angular'

interface ResizeController {
    profile?: string
    resizer?: object
}

interface ColumnLayout {
    columns: HTMLTableCellElement[]
    widths: number[]
    floors: number[]
    fixed: boolean[]
}

// Default proportions and readable minimums for the main library. Details use
// their own sizes because their text, number, and action columns differ.
const librarySizes: Record<string, [preferred: number, minimum: number]> = {
    decodedName: [300, 110],
    statusMessage: [108, 108],
    size: [78, 58],
    percent: [110, 68],
    downloadSpeed: [108, 78],
    uploadSpeed: [96, 70],
    uploaded: [92, 65],
    eta: [72, 51],
    ratio: [63, 46],
    peersConnected: [72, 52],
    seedsConnected: [72, 52],
    seedingTime: [87, 64],
    dateAdded: [120, 78],
    dateCompleted: [136, 86],
}
const detailSizes: Record<string, [preferred: number, minimum: number]> = {
    name: [270, 90], path: [250, 90], url: [300, 110], message: [140, 60],
    ip: [158, 80], client: [140, 65], torrentDetailsTrackersActions: [105, 54],
}

function tableScale(table: HTMLTableElement) {
    return table.getBoundingClientRect().width / table.offsetWidth || 1
}

function contentWidth(table: HTMLTableElement, column: HTMLTableCellElement) {
    const probe = table.cloneNode(false) as HTMLTableElement
    probe.removeAttribute('id')
    probe.classList.remove('fit-columns')
    probe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;width:max-content;min-width:0;max-width:none;table-layout:auto;pointer-events:none'
    probe.style.setProperty('width', 'max-content', 'important')
    probe.style.setProperty('min-width', '0', 'important')
    probe.setAttribute('aria-hidden', 'true')
    const body = probe.createTBody()
    const cells = Array.from(table.rows).map(row => row.cells[column.cellIndex]).filter(cell => cell && cell.colSpan === 1)
    for (const cell of cells) {
        const clone = cell.cloneNode(true) as HTMLTableCellElement
        clone.style.width = 'auto'
        clone.style.minWidth = '0'
        clone.style.maxWidth = 'none'
        clone.style.whiteSpace = 'nowrap'
        clone.style.font = getComputedStyle(cell).font
        clone.querySelectorAll('.rz-handle').forEach(handle => handle.remove())
        // Remove truncation constraints while preserving icons and controls.
        clone.querySelectorAll<HTMLElement>('.torrent-name-content, .torrent-details-file-name, [class*="name-text"]').forEach(name => {
            name.style.setProperty('max-width', 'none', 'important')
            name.style.setProperty('width', 'max-content', 'important')
        })
        body.insertRow().appendChild(clone)
    }
    table.parentElement!.appendChild(probe)
    try {
        return Math.ceil(probe.getBoundingClientRect().width / tableScale(table)) + 8
    } finally {
        probe.remove()
    }
}

// A companion to rzTable applies the same behavior to the torrent and detail tables.
export class TableAutoFitDirective implements IDirective {
    restrict = 'A'
    require = 'rzTable'

    static getInstance(): IDirectiveFactory {
        return () => new TableAutoFitDirective()
    }

    link(scope: IScope, element: IAugmentedJQuery, _attrs: unknown, controller: ResizeController) {
        const table = element[0] as HTMLTableElement
        table.classList.add('fit-columns')
        const isLibrary = table.id === 'torrentTable'
        const sizeHints = isLibrary ? librarySizes : detailSizes
        let frame = 0
        let layout: ColumnLayout | undefined
        let dragging: { handle: HTMLElement, index: number, start: number, scale: number, layout: ColumnLayout } | undefined
        let preferred: number[] | undefined
        let signature = ''
        const storageKey = () => `torrent-deck.fit-columns.${table.id}.${controller.profile || 'default'}`
        const headers = () => Array.from(table.tHead?.rows[0]?.cells || [])
        const getColumnKey = (column: HTMLTableCellElement) => column.dataset.col || column.id || column.textContent?.trim() || ''
        const labelDetailRows = (columns: HTMLTableCellElement[]) => {
            const labels = columns.map(column => column.textContent?.trim() || '')
            for (const row of Array.from(table.tBodies[0]?.rows || [])) {
                Array.from(row.cells).forEach((cell, index) => {
                    if (cell.colSpan !== 1) return
                    if (cell.dataset.label !== labels[index]) cell.dataset.label = labels[index] || ''
                })
            }
        }
        const fit = () => {
            if (frame) cancelAnimationFrame(frame)
            frame = 0
            const columns = headers()
            const available = table.parentElement?.clientWidth || 0
            if (!columns.length || !available) {
                layout = undefined
                return
            }
            const keys = columns.map(getColumnKey)
            const hints = keys.map(key => sizeHints[key] || [80, 48])
            const nextSignature = storageKey() + keys.join('|')
            if (signature !== nextSignature) {
                signature = nextSignature
                try { preferred = JSON.parse(localStorage.getItem(signature) || '[]') } catch { preferred = undefined }
                if (!Array.isArray(preferred) || preferred.length !== columns.length || preferred.some(width => !Number.isFinite(width) || width <= 0)) {
                    preferred = undefined
                }
            }
            table.style.setProperty('width', '100%', 'important')
            table.style.setProperty('min-width', '0', 'important')
            const fixed = columns.map(column => !!column.querySelector('input[type="checkbox"]'))
            const fixedWidth = Math.min(30, available / columns.length)
            const budget = available - fixed.filter(Boolean).length * fixedWidth
            const minimum = hints.flatMap(([_width, floor], index) => fixed[index] ? [] : [floor])
            const minimumTotal = minimum.reduce((sum, width) => sum + width, 0)
            // When the pane is crowded, keep a small amount of width adjustable
            // instead of pinning every divider at a compressed minimum.
            const resizeRoom = Math.min(32, budget * .08)
            const floorScale = Math.min(1, (budget - resizeRoom) / (minimumTotal || 1))
            const scaledMinimum = minimum.map(floor => floor * floorScale)
            // Share some room across the default columns. Left to the usual
            // weights, the Name column would take it all in a crowded pane.
            const defaultAllowance = !preferred && floorScale < 1 ? resizeRoom / (2 * minimum.length) : 0
            const allocationMinimum = scaledMinimum.map(floor => floor + defaultAllowance)
            const weights = preferred ?? hints.map(([width]) => width)
            const flexible = fitColumnWidths(weights.filter((_width, index) => !fixed[index]), budget, allocationMinimum)
            let flexibleIndex = 0
            const widths = columns.map((_column, index) => fixed[index] ? fixedWidth : flexible[flexibleIndex++])
            const floors = hints.map(([_width, floor], index) => fixed[index] ? fixedWidth : floor * floorScale)
            layout = { columns, widths, floors, fixed }
            table.classList.toggle('fit-columns-tight', floorScale < .8)
            columns.forEach((column, index) => {
                column.style.setProperty('width', `${widths[index] / available * 100}%`, 'important')
                const handle = column.querySelector<HTMLElement>('.rz-handle')
                if (!handle || fixed[index]) return
                handle.tabIndex = 0
                handle.setAttribute('role', 'separator')
                handle.setAttribute('aria-orientation', 'vertical')
                handle.setAttribute('aria-label', `Resize ${column.textContent?.trim() || keys[index]} column`)
                handle.setAttribute('aria-valuenow', String(Math.round(widths[index])))
                handle.setAttribute('aria-valuemin', String(Math.round(floors[index])))
                handle.setAttribute('aria-valuemax', String(Math.round(available)))
            })
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(fit) }
        const save = () => {
            if (!preferred) return
            try { localStorage.setItem(signature, JSON.stringify(preferred)) } catch { /* Fit still works without storage. */ }
        }
        const handleFrom = (event: Event) => event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.rz-handle') : null
        const resize = (start: ColumnLayout, index: number, delta: number) => {
            preferred = resizeFittedColumn(start.widths, start.floors, start.fixed, index, delta)
            schedule()
        }
        const onMouseDown = (event: MouseEvent) => {
            const handle = handleFrom(event)
            if (!handle || event.button !== 0) return
            fit()
            const header = handle.closest('th')
            const index = header ? layout?.columns.indexOf(header) ?? -1 : -1
            if (!layout || index < 0) return
            event.preventDefault()
            event.stopImmediatePropagation()
            if (layout.fixed[index]) return
            handle.classList.add('rz-handle-active')
            dragging = { handle, index, start: event.clientX, scale: tableScale(table), layout }
        }
        const onMove = (event: MouseEvent) => {
            if (!dragging || !table.contains(dragging.handle)) return
            resize(dragging.layout, dragging.index, (event.clientX - dragging.start) / dragging.scale)
        }
        const onUp = () => {
            if (!dragging) return
            dragging.handle.classList.remove('rz-handle-active')
            dragging = undefined
            if (frame) fit()
            save()
        }
        const onAdjust = (event: MouseEvent | KeyboardEvent) => {
            const header = handleFrom(event)?.closest('th')
            if (!header) return
            const key = event instanceof KeyboardEvent ? event.key : 'Enter'
            if (!['Enter', 'ArrowLeft', 'ArrowRight'].includes(key)) return
            fit()
            const index = layout?.columns.indexOf(header) ?? -1
            if (!layout || index < 0 || layout.fixed[index]) return
            event.preventDefault()
            event.stopImmediatePropagation()
            const delta = key === 'Enter' ? contentWidth(table, header) - layout.widths[index] : key === 'ArrowLeft' ? -12 : 12
            resize(layout, index, delta)
            fit()
            save()
        }
        const onClick = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('.rz-handle')) event.stopPropagation()
        }
        const observer = new ResizeObserver(schedule)
        if (table.parentElement) observer.observe(table.parentElement)
        const mutations = new MutationObserver(() => {
            schedule()
            if (!isLibrary) labelDetailRows(headers())
        })
        mutations.observe(table, { childList: true })
        if (table.tHead) mutations.observe(table.tHead, { childList: true, subtree: true, characterData: true })
        if (!isLibrary && table.tBodies[0]) {
            labelDetailRows(headers())
            mutations.observe(table.tBodies[0], { childList: true, subtree: true })
        }
        const unwatch = scope.$watch(() => controller.resizer, schedule)
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        schedule()
        table.addEventListener('dblclick', onAdjust)
        table.addEventListener('keydown', onAdjust, true)
        table.addEventListener('mousedown', onMouseDown, true)
        table.addEventListener('click', onClick, true)
        scope.$on('$destroy', () => {
            observer.disconnect()
            mutations.disconnect()
            unwatch()
            cancelAnimationFrame(frame)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            table.removeEventListener('dblclick', onAdjust)
            table.removeEventListener('keydown', onAdjust, true)
            table.removeEventListener('mousedown', onMouseDown, true)
            table.removeEventListener('click', onClick, true)
        })
    }
}
