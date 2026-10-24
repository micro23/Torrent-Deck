import { IAttributes, IAugmentedJQuery, IDirective, IDirectiveFactory, IScope } from "angular";
import { ModalController } from "./modal.controller";

interface ModalAttributes extends IAttributes {
    closable?: string
    size?: string
}

export class ModalDirective implements IDirective {
    restrict = "E"
    scope = {}
    bindToController = {
        size: "@?",
        closable: "<?",
        approve: "&?",
        deny: "&?",
        after: "&?",
        onHidden: "&?",
        hidden: "&?",
        onShow: "&?",
        show: "&?",
    }
    controller = ModalController
    controllerAs = "$modal"
    transclude = true
    template = ""

    static getInstance(): IDirectiveFactory {
        return () => new ModalDirective()
    }

    link(
        scope: IScope,
        element: IAugmentedJQuery,
        attr: ModalAttributes,
        controller: ModalController,
        transclude: any,
    ) {
        let accepted = false

        transclude((contents: IAugmentedJQuery, transcludedScope: any) => {
            transcludedScope.$modal = controller
            element.append(contents)
        })

        element.addClass("ui modal")
        if (controller.size) {
            element.addClass(controller.size)
        }

        const modal: any = $(element)

        controller.attachModal(modal)

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !modal.modal("is active")) {
                return
            }

            // Escape belongs to the active child control before its dialog.
            // Capture before Fomantic's focused-dropdown handler can consume an
            // Escape even when its menu is already closed (notably on Linux).
            if (event.defaultPrevented) return
            const activeModal = $(".ui.modal.active").last()[0]
            if (activeModal && activeModal !== element[0]) return
            const dropdowns = modal.find(".ui.dropdown.active")
            if (dropdowns.length) {
                event.preventDefault()
                event.stopPropagation()
                dropdowns.dropdown("hide")
                return
            }

            event.preventDefault()
            event.stopPropagation()
            modal.modal("hide")
        }

        document.addEventListener("keydown", onKeyDown, true)

        modal.modal({
            onDeny: () => {
                accepted = false
                return controller.deny?.()
            },
            onApprove: () => {
                accepted = true
                if (!controller.approve) {
                    return true
                }
                return controller.approve()
            },
            onHidden: () => {
                ModalDirective.clearForm(element)
                controller.after?.({ accepted })
                controller.onHidden?.()
                controller.hidden?.()
            },
            onShow: () => {
                accepted = false
                controller.onShow?.()
                controller.show?.()
            },
            onVisible: () => {
                modal.modal('refresh')
            },
            closable: attr.closable === "" || controller.closable === true,
            keyboardShortcuts: false,
            duration: 150
        });
        scope.$on("$destroy", function() {
            document.removeEventListener("keydown", onKeyDown, true)
            element.remove();
        });
    }

    static clearForm(element: IAugmentedJQuery) {
        const form: any = $(element)
        if (!form.find('[ng-model], [data-ng-model], [x-ng-model]').length) {
            form.form('clear');
        }
        form.find('.error.message').empty()
    }

}
