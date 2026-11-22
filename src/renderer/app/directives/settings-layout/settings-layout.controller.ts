export class SettingsLayoutController {
    server: any;
    sortOptions: any;

    moveColumn(event: KeyboardEvent, index: number) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const columns = this.server.columns;
        const target = index + (event.key === "ArrowUp" ? -1 : 1);
        if (target < 0 || target >= columns.length) return;
        const [column] = columns.splice(index, 1);
        columns.splice(target, 0, column);
        const handle = event.currentTarget as HTMLElement;
        requestAnimationFrame(() => handle.focus());
    }
}
