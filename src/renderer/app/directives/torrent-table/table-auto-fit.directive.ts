import { fitColumnWidths } from '@renderer/app/lib/fit-column-widths'
import type { IAugmentedJQuery, IDirective, IDirectiveFactory, IScope } from 'angular'

interface ResizeController {
    resizer: {
        handleMiddleware(handle: JQuery, column: HTMLElement): HTMLElement | JQuery
        getMinWidth(column: HTMLElement): number
        onEndDrag(): void
        calculate(originalWidth: number, delta: number): number
        intervene?: {
            selector(column: HTMLElement): JQuery
            calculator?(originalWidth: number, delta: number): number
        }
    }
    saveColumnSizes(): void
}

function tableScale(table: HTMLTableElement) {
    return table.offsetWidth ? table.getBoundingClientRect().width / table.offsetWidth : 1
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
    const cells = Array.from(table.rows).map(row => row.cells[column.cellIndex]).filter(Boolean)
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
        const width = Math.max(...Array.from(probe.rows).map(row => row.cells[0].getBoundingClientRect().width), 0)
        const style = getComputedStyle(column)
        return Math.ceil(width / tableScale(table) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) + 8
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
        let frame = 0
        let dragging: { header: HTMLTableCellElement, start: number, widths: number[] } | null = null
        let preferred: number[] = []
        let signature = ''
        const storageKey = () => `torrent-deck.fit-columns.${table.id}.${(controller as any).profile || 'default'}`
        const headers = () => Array.from(table.tHead?.rows[0]?.cells || [])
        const fit = () => {
            frame = 0
            const columns = headers()
            if (!columns.length || !table.parentElement?.clientWidth) return
            const nextSignature = storageKey() + columns.map(col => col.dataset.col || col.id || col.textContent?.trim()).join('|')
            if (signature !== nextSignature) {
                signature = nextSignature
                try { preferred = JSON.parse(localStorage.getItem(signature) || '[]') } catch { preferred = [] }
                if (preferred.length !== columns.length || preferred.some(width => !Number.isFinite(width) || width <= 0)) {
                    preferred = columns.map(col => /name|torrent|url|path/i.test(col.dataset.col || col.textContent || '') ? 280 : col.querySelector('input') ? 30 : 90)
                }
            }
            table.style.setProperty('width', '100%', 'important')
            table.style.setProperty('min-width', '0', 'important')
            const available = table.parentElement.clientWidth
            const fixed = columns.map(col => col.querySelector('input[type="checkbox"]') ? Math.min(30, available / columns.length) : 0)
            const flexible = fitColumnWidths(preferred.filter((_width, index) => !fixed[index]), Math.max(0, available - fixed.reduce((sum, width) => sum + width, 0)))
            let flexibleIndex = 0
            columns.forEach((column, index) => column.style.setProperty('width', `${(fixed[index] || flexible[flexibleIndex++]) / available * 100}%`, 'important'))
            for (const row of Array.from(table.tBodies[0]?.rows || [])) {
                Array.from(row.cells).forEach((cell, index) => {
                    cell.dataset.label = columns[index]?.textContent?.trim() || ''
                })
            }
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(fit) }
        const save = () => { try { localStorage.setItem(signature, JSON.stringify(preferred)) } catch { /* Fit still works without storage. */ } }
        const onMouseDown = (event: MouseEvent) => {
            const header = event.target instanceof Element ? event.target.closest('.rz-handle')?.closest('th') : null
            if (!header || event.button !== 0) return
            event.preventDefault()
            event.stopImmediatePropagation()
            dragging = { header, start: event.clientX, widths: headers().map(col => col.getBoundingClientRect().width) }
        }
        const onMove = (event: MouseEvent) => {
            if (!dragging) return
            const index = headers().indexOf(dragging.header)
            const adjacent = index === dragging.widths.length - 1 ? index - 1 : index + 1
            if (adjacent < 0) return
            const widths = [...dragging.widths]
            const minimum = Math.min(24, (widths[index] + widths[adjacent]) / 3)
            const delta = Math.max(minimum - widths[index], Math.min(widths[adjacent] - minimum, event.clientX - dragging.start))
            widths[index] += delta
            widths[adjacent] -= delta
            preferred = widths
            schedule()
        }
        const onUp = () => { if (dragging) { dragging = null; fit(); save() } }
        const onDoubleClick = (event: MouseEvent) => {
            const header = event.target instanceof Element ? event.target.closest('.rz-handle')?.closest('th') : null
            if (!header) return
            event.preventDefault()
            event.stopImmediatePropagation()
            preferred[headers().indexOf(header)] = Math.max(32, contentWidth(table, header))
            fit()
            save()
        }
        const onClick = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('.rz-handle')) event.stopPropagation()
        }
        const observer = new ResizeObserver(schedule)
        if (table.parentElement) observer.observe(table.parentElement)
        const mutations = new MutationObserver(schedule)
        mutations.observe(table, { childList: true, subtree: true })
        const unwatch = scope.$watch(() => controller.resizer, schedule)
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        schedule()
        table.addEventListener('dblclick', onDoubleClick)
        table.addEventListener('mousedown', onMouseDown, true)
        table.addEventListener('click', onClick, true)
        scope.$on('$destroy', () => {
            observer.disconnect()
            mutations.disconnect()
            unwatch()
            cancelAnimationFrame(frame)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            table.removeEventListener('dblclick', onDoubleClick)
            table.removeEventListener('mousedown', onMouseDown, true)
            table.removeEventListener('click', onClick, true)
        })
    }
}
