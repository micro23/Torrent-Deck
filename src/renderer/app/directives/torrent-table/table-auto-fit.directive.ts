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
    probe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;width:max-content;min-width:0;max-width:none;table-layout:auto;pointer-events:none'
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
        const adjustedResizers = new WeakSet<object>()
        const onMouseDown = (event: MouseEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('.rz-handle')) return
            const resizer = controller.resizer
            if (!resizer || adjustedResizers.has(resizer)) return
            const calculate = resizer.calculate.bind(resizer)
            resizer.calculate = (width, delta) => calculate(width, delta / tableScale(table))
            if (resizer.intervene?.calculator) {
                const calculateAdjacent = resizer.intervene.calculator.bind(resizer.intervene)
                resizer.intervene.calculator = (width, delta) => calculateAdjacent(width, delta / tableScale(table))
            }
            adjustedResizers.add(resizer)
        }
        const onDoubleClick = (event: MouseEvent) => {
            const handle = event.target instanceof Element ? event.target.closest<HTMLElement>('.rz-handle') : null
            const header = handle?.closest('th') as HTMLTableCellElement | null
            if (!handle || !header || !controller.resizer) return
            event.preventDefault()
            event.stopPropagation()
            const column = $(controller.resizer.handleMiddleware($(handle), header))[0] as HTMLTableCellElement
            if (!column) return
            const width = Math.max(controller.resizer.getMinWidth(column), contentWidth(table, column))
            const adjacent = controller.resizer.intervene?.selector(column)
            if (adjacent?.length) {
                const available = $(column).width()! + adjacent.width()!
                const adjacentMinimum = controller.resizer.getMinWidth(adjacent[0])
                const fitted = Math.min(width, available - adjacentMinimum)
                $(column).width(fitted)
                adjacent.width(available - fitted)
            } else {
                $(column).width(width)
            }
            controller.resizer.onEndDrag()
            controller.saveColumnSizes()
        }
        const onClick = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('.rz-handle')) event.stopPropagation()
        }
        table.addEventListener('dblclick', onDoubleClick)
        table.addEventListener('mousedown', onMouseDown, true)
        table.addEventListener('click', onClick, true)
        scope.$on('$destroy', () => {
            table.removeEventListener('dblclick', onDoubleClick)
            table.removeEventListener('mousedown', onMouseDown, true)
            table.removeEventListener('click', onClick, true)
        })
    }
}
