import { IAugmentedJQuery, IDirective, IDirectiveFactory, IScope } from "angular";
import { TorrentBodyController } from "./torrent-table.controller";

export class TorrentBodyDirective implements IDirective {
    restrict = "A";
    controller = TorrentBodyController;
    bindToController = true;
    scope = {
        columns: "=",
    };

    static getInstance(): IDirectiveFactory {
        return () => new TorrentBodyDirective();
    }

    link(scope: IScope, element: IAugmentedJQuery, attr: unknown, controller: TorrentBodyController) {
        controller.renderTemplate();

        scope.$watch(
            () => controller.columns,
            () => {
                controller.render();
            },
            true,
        );
    }
}

export class TorrentRowDirective implements IDirective {
    restrict = "A";
    require = "^^torrentBody";
    scope = false;

    static getInstance(): IDirectiveFactory {
        return () => new TorrentRowDirective();
    }

    link(scope: IScope, element: IAugmentedJQuery, attr: unknown, controller: TorrentBodyController) {
        let cellScope: IScope | undefined;
        const render = () => {
            cellScope?.$destroy();
            element.empty();
            cellScope = scope.$new();
            controller.$link(cellScope, (clone) => {
                element.append(clone);
            });
        };

        render();
        const unsubscribe = controller.subscribe(render);
        scope.$on("$destroy", unsubscribe);
    }
}
