import { IDocumentService, IScope, IWindowService } from "angular";
import type { ElectorrentRootScope } from "@renderer/app/types/root-scope";

type TorrentDetailsTab = "info" | "files" | "peers" | "trackers";

const panelSizeKey = "electorrent-deck-details-size";
const defaultPanelHeight = 320;
const defaultPanelWidth = 400;
const minPanelHeight = 220;
const minPanelWidth = 320;
const maxPanelHeight = 600;
const maxPanelWidth = 720;

export interface TorrentDetailsPanelScope extends IScope {
  isOpen: boolean;
  torrent: any;
  refresh: number;
  activeTab: TorrentDetailsTab;
}

export class TorrentDetailsPanelController {
  static $inject = ["$scope", "$rootScope", "$window", "$document"];

  private panelHeight = defaultPanelHeight;
  private panelWidth = defaultPanelWidth;
  private isSidePanel() {
    return this.rootScope.deckTheme === "darkhand" && this.rootScope.deckLayout?.details === "right" && this.$window.innerWidth > 1100;
  }
  private stopResizeListeners?: () => void;

  constructor(
    public scope: TorrentDetailsPanelScope,
    private rootScope: ElectorrentRootScope,
    private $window: IWindowService,
    private $document: IDocumentService,
  ) {
    try {
      const saved = JSON.parse(this.$window.localStorage.getItem(panelSizeKey) || "{}");
      this.panelHeight = Math.max(minPanelHeight, Math.min(maxPanelHeight, Number(saved.height) || defaultPanelHeight));
      this.panelWidth = Math.max(minPanelWidth, Math.min(maxPanelWidth, Number(saved.width) || defaultPanelWidth));
    } catch { /* Use the default panel size. */ }
    this.scope.isOpen = false;
    this.scope.torrent = null;
    this.scope.refresh = 0;
    this.scope.activeTab = this.defaultTab();

    const openListener = this.rootScope.$on("torrentDetails:open", (_event, torrent) => {
      this.open(torrent);
    });
    const syncListener = this.rootScope.$on("torrentDetails:sync", (_event, torrent, allowOpen) => {
      if (!this.scope.isOpen) {
        if (allowOpen && this.rootScope.deckTheme === "darkhand" && torrent) this.open(torrent);
        else return;
      }

      if (!torrent) {
        this.clearSelection();
        return;
      }

      this.scope.torrent = torrent;
      this.scope.refresh += 1;
    });
    const resetListener = this.rootScope.$on("wipe:torrents", () => {
      this.close();
    });
    const escapeListener = this.rootScope.$on("shortcut:escape", () => {
      if (this.scope.isOpen) this.close();
    });

    this.scope.$on("$destroy", () => {
      openListener();
      syncListener();
      resetListener();
      escapeListener();
      this.stopResizeListeners?.();
    });
  }

  open(torrent: any) {
    if (!torrent) {
      return;
    }

    this.scope.isOpen = true;
    this.scope.activeTab = this.defaultTab();
    this.scope.torrent = torrent;
    this.applyPreferredSize();
    this.scope.refresh += 1;
  }

  close() {
    this.stopResizeListeners?.();
    this.scope.isOpen = false;
    this.scope.activeTab = "info";
    this.clearSelection();
  }

  showTab(tab: TorrentDetailsTab) {
    this.scope.activeTab = tab;
  }

  isActiveTab(tab: TorrentDetailsTab) {
    return this.scope.activeTab === tab;
  }

  canShowPeers() {
    return !!this.rootScope.$btclient?.features.torrentPeers;
  }

  canShowDetails() {
    return !!this.rootScope.$btclient?.features.torrentDetails;
  }

  canShowTrackers() {
    return !!this.rootScope.$btclient?.features.torrentTrackers;
  }

  canManageTrackers() {
    return !!this.rootScope.$btclient?.features.torrentTrackerManagement;
  }

  openAddTracker() {
    this.scope.$broadcast("torrentDetailsTrackers:add");
  }

  startResizing(event: MouseEvent) {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    const panel = handle.closest<HTMLElement>(".torrent-details-panel");
    const page = panel?.closest<HTMLElement>(".main-panel");
    if (!panel || !page) return;

    event.preventDefault();
    event.stopPropagation();

    const side = this.isSidePanel();
    const start = side ? event.clientX : event.clientY;
    const bounds = panel.getBoundingClientRect();
    const scale = bounds.width / panel.offsetWidth || 1;
    const startSize = (side ? bounds.width : bounds.height) / scale;
    const originalPreference = side ? this.panelWidth : this.panelHeight;
    const maxSize = side
      ? Math.min(maxPanelWidth, page.getBoundingClientRect().width * .48 / scale)
      : Math.min(maxPanelHeight, this.$window.innerHeight * .48 / scale);
    const minSize = Math.min(side ? minPanelWidth : minPanelHeight, maxSize);
    const documentRef = this.$document[0];
    let changed = false;

    this.stopResizeListeners?.();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (start - (side ? moveEvent.clientX : moveEvent.clientY)) / scale;
      const nextSize = delta === 0
        ? originalPreference
        : Math.round(Math.max(minSize, Math.min(maxSize, startSize + delta)));
      if (side) this.panelWidth = nextSize;
      else this.panelHeight = nextSize;
      changed = nextSize !== originalPreference;
      this.applyPreferredSize();
    };

    const onMouseUp = () => {
      if (changed) {
        try { this.$window.localStorage.setItem(panelSizeKey, JSON.stringify({ height: this.panelHeight, width: this.panelWidth })); } catch { /* Resizing still works without storage. */ }
      }
      documentRef.removeEventListener("mousemove", onMouseMove);
      documentRef.removeEventListener("mouseup", onMouseUp);
      this.stopResizeListeners = undefined;
    };

    documentRef.addEventListener("mousemove", onMouseMove);
    documentRef.addEventListener("mouseup", onMouseUp);
    this.stopResizeListeners = onMouseUp;
  }

  private applyPreferredSize() {
    const page = this.$document[0].querySelector<HTMLElement>("#page-torrents");
    page?.style.setProperty("--deck-details-width", `${this.panelWidth}px`);
    page?.style.setProperty("--deck-details-height", `${this.panelHeight}px`);
  }

  private clearSelection() {
    this.scope.torrent = null;
    this.scope.refresh += 1;
  }

  private defaultTab(): TorrentDetailsTab {
    return this.rootScope.$btclient?.features.torrentDetails ? "info" : "trackers";
  }
}
