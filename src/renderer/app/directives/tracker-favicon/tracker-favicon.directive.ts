import type { IAugmentedJQuery, IAttributes, IDirective, IDirectiveFactory, IScope } from "angular"
import { trackerFaviconCandidates } from "./favicon-candidates"

export class TrackerFaviconDirective implements IDirective {
    restrict = "A"

    static getInstance(): IDirectiveFactory {
        return () => new TrackerFaviconDirective()
    }

    link(scope: IScope, element: IAugmentedJQuery, attrs: IAttributes) {
        let dispose = () => {}
        scope.$watch(attrs.trackerFavicon, (value: string) => {
            dispose()
            element.empty().removeClass("tracker-favicon-fallback")
            const candidates = trackerFaviconCandidates(value || "")
            if (!candidates.length) {
                element.prop("hidden", true)
                return
            }
            element.prop("hidden", false)
            const img = element[0].ownerDocument.createElement("img")
            img.alt = ""
            img.referrerPolicy = "no-referrer"
            img.hidden = true
            let index = 0
            const failed = () => {
                img.hidden = true
                if (++index < candidates.length) {
                    img.src = candidates[index]
                } else {
                    // A neutral network symbol only after every real icon fails.
                    element.addClass("tracker-favicon-fallback")
                }
            }
            const loaded = () => { img.hidden = false }
            img.addEventListener("error", failed)
            img.addEventListener("load", loaded)
            element.append(img)
            element.append('<svg class="tracker-favicon-unavailable" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/></svg>')
            element.attr("role", "img").attr("aria-label", `${new URL(candidates[0]).hostname} tracker icon`)
            img.src = candidates[index]
            dispose = () => {
                img.removeEventListener("error", failed)
                img.removeEventListener("load", loaded)
            }
        })
        scope.$on("$destroy", () => dispose())
    }
}
