import Fuse from "fuse.js";
import { TorrentUploadOptions } from "@renderer/app/bittorrent/torrentclient";
import { PendingTorrentUploadItem, PendingTorrentUploadList } from "@renderer/app/directives/add-torrent-modal/add-torrent-modal.directive";
import { ModalController } from "@renderer/app/directives/modal/modal.controller";
import type { SortChange } from "@renderer/app/directives/sorting/sorting.controller";
import { matchesLabelFilter } from "@renderer/app/directives/torrent-sidebar/torrent-label-filter";
import { DEFAULT_TABLE_RESIZE_OPTIONS } from "@renderer/app/lib/table-resize-options";
import type { ElectorrentRootScope } from "@renderer/app/types/root-scope";
import type { TorrentActionItem } from "@shared/torrent-actions";

interface TorrentControllerScope extends angular.IScope {
    pendingTorrentFiles: PendingTorrentUploadList;
    deleteModalref?: ModalController;
    deleteConfirmation?: {
        action: ((torrents: any[]) => Promise<void>) | null;
        removeAction?: ((torrents: any[]) => Promise<void>) | null;
        deleteDataAction?: ((torrents: any[]) => Promise<void>) | null;
        mode?: "confirm" | "remove-options";
        label: string;
        torrents: any[];
    };
    speedLimitModalRef?: { open(torrents: any[]): void };
    setRatioModalRef?: { open(torrents: any[]): void };
    setLocationModalRef?: { open(torrents: any[]): void };
    setLabelModalRef?: { open(torrents: any[]): void };
    [key: string]: any;
}

export class TorrentsPageController {
    static $inject = ["$rootScope", "$scope", "$timeout", "$filter", "$q", "$bittorrent", "notificationService", "settingsService"];

    constructor(
        $rootScope: ElectorrentRootScope,
        $scope: TorrentControllerScope,
        $timeout: angular.ITimeoutService,
        $filter: angular.IFilterService,
        $q: angular.IQService,
        $bittorrent: any,
        $notify: any,
        settingsService: any,
    ) {
        const LIMIT = 25;
        const SYNC_LATENCY_SAMPLE_SIZE = 5;
        const MIN_SLOW_LATENCY_MS = 1000;
        const MAX_SLOW_LATENCY_MS = 2000;
        const SLOW_LATENCY_FACTOR = 3;

        let selected: any[] = [];
        let detailsTorrent: any = null;
        let timeout: angular.IPromise<void> | undefined;
        let reconnect: angular.IPromise<void> | undefined;
        let slowSyncTimer: angular.IPromise<void> | undefined;
        let slowConnectionTimer: angular.IPromise<void> | undefined;
        let deferredUploads: Array<{ item: PendingTorrentUploadItem; askUploadOptions: boolean }> = [];

        let settings = settingsService.getAllSettings();
        let refreshRate = settings.refreshRate || 2000;

        $rootScope.$syncConnection = $rootScope.$syncConnection || { state: "normal", responseTimes: [] };

        $scope.settings = settingsService.getAllSettings();
        $scope.connectionLost = false;
        $scope.torrents = {};
        $scope.arrayTorrents = [];
        $scope.totalDownloadSpeed = 0;
        $scope.totalUploadSpeed = 0;
        $scope.totalDownloaded = 0;
        $scope.totalUploaded = 0;
        $scope.connectedPeers = 0;
        $scope.sessionStats = {};
        $scope.activeTorrentCount = 0;
        const layoutKey = "electorrent-deck-layout";
        const readStored = (key: string, fallback: any) => {
            try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch { return fallback; }
        };
        const savedLayout = readStored(layoutKey, {});
        $rootScope.deckLayout = {
            stats: savedLayout.stats === "above" ? "above" : "below",
            details: savedLayout.details === "right" ? "right" : "bottom",
        };
        $scope.setDeckPlacement = (key: "stats" | "details", value: string) => {
            $rootScope.deckLayout[key] = value;
            try { localStorage.setItem(layoutKey, JSON.stringify($rootScope.deckLayout)); } catch { /* Storage may be unavailable. */ }
        };
        $scope.deckChartMinutes = Math.max(1, Math.min(129600, Number(readStored("electorrent-deck-chart-minutes", 5)) || 5));
        $scope.updateDeckChart = () => {
            $scope.deckChartMinutes = Math.max(1, Math.min(129600, Number($scope.deckChartMinutes) || 5));
            try { localStorage.setItem("electorrent-deck-chart-minutes", JSON.stringify($scope.deckChartMinutes)); } catch { /* Storage may be unavailable. */ }
            renderDeckHistory();
        };
        const historyKey = `electorrent-deck-history:${$rootScope.$server?.id || "default"}`;
        let speedHistory: number[][] = readStored(historyKey, []);
        if (!Array.isArray(speedHistory)) speedHistory = [];
        speedHistory = speedHistory.filter(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite));
        let lastHistorySave = 0;
        function renderDeckHistory() {
            const now = Date.now();
            const start = now - $scope.deckChartMinutes * 60000;
            const rows = speedHistory.filter(row => row[0] >= start && row[0] <= now);
            const step = Math.max(1, Math.ceil(rows.length / 600));
            const visible = rows.filter((_row, index) => index % step === 0 || index === rows.length - 1);
            const max = Math.max(1, ...visible.flatMap(row => [row[1], row[2]])) * 1.2;
            $scope.deckChartMax = max;
            $scope.deckHistoryPaths = [1, 2].map(column => {
                let previous = 0;
                return visible.map(row => {
                    const command = !previous || row[0] - previous > Math.max(90000, step * 90000) ? "M" : "L";
                    previous = row[0];
                    return `${command}${((row[0] - start) / ($scope.deckChartMinutes * 60000) * 700).toFixed(2)},${(110 - row[column] / max * 100).toFixed(2)}`;
                }).join(" ");
            });
            $scope.deckChartStart = start;
            $scope.deckChartNow = now;
        }
        function recordDeckHistory() {
            const now = Date.now();
            const last = speedHistory[speedHistory.length - 1];
            if (!last || now - last[0] >= 15000) speedHistory.push([now, $scope.totalDownloadSpeed, $scope.totalUploadSpeed]);
            // Fine samples for one hour; minute samples for up to 90 days.
            speedHistory = speedHistory.filter((row, index, rows) => row[0] >= now - 90 * 86400000 &&
                (row[0] >= now - 3600000 || index === 0 || Math.floor(row[0] / 60000) !== Math.floor(rows[index - 1][0] / 60000)));
            if (now - lastHistorySave >= 60000) {
                try { localStorage.setItem(historyKey, JSON.stringify(speedHistory)); } catch { /* Chart still works in memory. */ }
                lastHistorySave = now;
            }
            renderDeckHistory();
        }
        $scope.downloadChart = "0,22 12,16 24,19 36,10 48,14 60,5 72,12 84,8 96,14 108,5 120,9";
        $scope.uploadChart = "0,17 12,20 24,14 36,18 48,9 60,13 72,6 84,15 96,8 108,12 120,4";
        const downloadHistory: number[] = [];
        const uploadHistory: number[] = [];
        const chartPoints = (samples: number[]) => {
            const values = samples.length ? samples : [0];
            const max = Math.max(1, ...values);
            return values.map((value, index) => `${Math.round(index * 120 / Math.max(values.length - 1, 1))},${Math.round(25 - value / max * 21)}`).join(" ");
        };
        $scope.freeDiskSpace = null;
        $scope.alternativeSpeedLimitsEnabled = false;
        $scope.contextMenu = null;
        $scope.showDragAndDrop = false;
        $scope.labelsDrowdown = null;
        $scope.torrentLimit = LIMIT;
        setLabels([]);
        $scope.trackers = [];
        $scope.guiBusy = true;
        $scope.pendingTorrentFiles = [];
        $scope.tableResizeOptions = DEFAULT_TABLE_RESIZE_OPTIONS;
        $scope.uploadAdvancedOptionsKey = "Ctrl";
        $scope.deleteConfirmation = {
            action: null,
            removeAction: null,
            deleteDataAction: null,
            mode: "confirm",
            label: "",
            torrents: [],
        };

        window.electorrent.app.getMeta().then((meta) => {
            $scope.uploadAdvancedOptionsKey = meta.isMacOS ? "⌥" : "Ctrl";
        });

        $scope.filters = {
            status: "all",
            search: "",
            options: { debounce: 150 },
        };

        const fuseOptions = {
            tokenize: true,
            matchAllTokens: true,
            findAllMatches: true,
            threshold: 0.15,
            location: 0,
            distance: 100,
            maxPatternLength: 32,
            minMatchCharLength: 1,
            keys: [
                "decodedName",
            ],
        };

        const fuse = new Fuse($scope.arrayTorrents, fuseOptions);

        $rootScope.$on("show:draganddrop", (event: unknown, show: boolean) => {
            $scope.showDragAndDrop = show;
            $scope.$applyAsync();
        });

        $scope.$on("new:settings", (event: unknown, data: any) => {
            refreshRate = data.refreshRate;
            settings = settingsService.getAllSettings();
            $scope.settings = settingsService.getAllSettings();
            resetAll();
        });

        $scope.showMore = () => {
            $scope.torrentLimit += LIMIT;
        };

        $scope.debug = () => {
            for (let index = 0; index < selected.length; index += 1) {
                console.info(selected[index]);
            }
            return $q.when();
        };

        $scope.renderDone = () => {
            $scope.guiBusy = false;
            $timeout(() => {
                $rootScope.$broadcast("hide:loading");
            }, 100);
        };

        const isServerReady = () => {
            return !!($rootScope.$btclient && $rootScope.$server?.isConnected);
        };

        const supportsMagnetUploadOptions = () => {
            return Object.values($rootScope.$btclient?.features.uploadOptions || {}).some(Boolean);
        };

        $scope.supportsUploadOptions = supportsMagnetUploadOptions;

        const shouldPromptForUploadOptions = (item: PendingTorrentUploadItem, askUploadOptions: boolean) => {
            const wantsPrompt = settings.alwaysPromptUploadOptions === true || askUploadOptions === true;
            if (!wantsPrompt) {
                return false;
            }

            if (item.type === "link") {
                return supportsMagnetUploadOptions();
            }

            return true;
        };

        const addTorrentMetadata = async (item: PendingTorrentUploadItem) => {
            if (item.metadata) {
                return item;
            }

            try {
                item.metadata = item.type === "file"
                    ? await window.electorrent.torrents.parse({ data: item.data })
                    : await window.electorrent.torrents.parse({ uri: item.uri });
            } catch (error) {
                console.warn("Could not parse torrent metadata", error);
            }

            return item;
        };

        const processUploadItem = async (item: PendingTorrentUploadItem, askUploadOptions: boolean) => {
            await addTorrentMetadata(item);

            if (shouldPromptForUploadOptions(item, askUploadOptions)) {
                $scope.pendingTorrentFiles.push(item);
            } else {
                try {
                    if (item.type === "file") {
                        await $scope.uploadTorrent(item.data, item.filename, undefined, item.sourcePath);
                    } else {
                        await $scope.uploadTorrentURL(item.uri);
                    }
                } catch (error) {
                    // Preserve automatic uploads for correction and retry in the add dialog.
                    $scope.pendingTorrentFiles.push(item);
                    $notify.alert("Could not add torrent", error instanceof Error ? error.message : String(error));
                }
            }

            $scope.$applyAsync();
        };

        const flushDeferredUploads = () => {
            if (!isServerReady() || deferredUploads.length === 0) {
                return;
            }
            const uploads = deferredUploads;
            deferredUploads = [];
            uploads.forEach(({ item, askUploadOptions }) => {
                processUploadItem(item, askUploadOptions);
            });
        };

        $scope.$on("start:torrents", (event: unknown, fullupdate: boolean) => {
            $scope.update(!!fullupdate);
            startTimer();
            flushDeferredUploads();
        });

        $scope.$on("wipe:torrents", () => {
            initialSnapshotRendered = false;
            $scope.connectionLost = false;
            setSyncConnectionState("normal");
            deselectAll();
            detailsTorrent = null;
            clearAll();
            syncDetailsPanel();
            $scope.filters = {
                status: "all",
            };
            $notify.enableAll();
        });

        $scope.$on("torrents:add", (event: unknown, item: PendingTorrentUploadItem, askUploadOptions: boolean) => {
            if (!isServerReady()) {
                deferredUploads.push({ item, askUploadOptions: !!askUploadOptions });
            } else {
                processUploadItem(item, !!askUploadOptions);
            }
            $scope.$applyAsync();
        });

        $scope.uploadTorrent = async (torrent: Uint8Array, filename: string, options?: TorrentUploadOptions, sourcePath?: string) => {
            try {
                if (!$rootScope.$btclient) throw new Error("Connect to a torrent server before adding a torrent.");
                await $rootScope.$btclient.uploadTorrent(torrent, filename, options, sourcePath);
                void syncAfterTorrentMutation();
            } catch (e) {
                console.error(e);
                throw e;
            }
        };

        $scope.uploadTorrentURL = async (uri: string, options?: TorrentUploadOptions) => {
            try {
                if (!$rootScope.$btclient) throw new Error("Connect to a torrent server before adding a torrent.");
                await $rootScope.$btclient.addTorrentUrl(uri, options);
                void syncAfterTorrentMutation();
            } catch (err) {
                console.error(err);
                throw err;
            }
        };

        $scope.openTorrentFiles = () => {
            window.electorrent.torrents.openFiles(true).then((files) => {
                files.forEach((file) => {
                    $scope.$broadcast("torrents:add", {
                        ...file,
                        data: new Uint8Array(file.data),
                    }, true);
                });
                $scope.$applyAsync();
            }).catch((err: unknown) => {
                console.error("Could not open torrent files", err);
                $notify.alert("Could not open torrent files", "Select a valid .torrent file and try again");
            });
        };

        $scope.$on("shortcut:add-torrent", () => $scope.openTorrentFiles());
        $scope.$on("shortcut:refresh-torrents", () => {
            if (isServerReady()) void $scope.update(true).catch(() => undefined);
        });

        $scope.$on("stop:torrents", () => {
            stopTimer();
        });

        $scope.$on("show:settings", () => {
            stopTimer();
        });

        $scope.$on("select:torrents", () => {
            selectAll();
        });

        $scope.$on("remove:torrents", () => {
            remove();
        });

        $scope.$on("remove-and-delete:torrents", () => {
            const deleteAction = findContextActionByRole($rootScope.$btclient?.contextMenu || [], "delete");
            if (deleteAction && selected.length > 0) {
                if (settings.confirmTorrentDeletion !== false) {
                    openDeleteConfirmation(deleteAction.click, deleteAction.label);
                } else {
                    runContextAction(deleteAction.click, selected);
                }
            }
        });

        $scope.$on("torrent-action", (_event: unknown, item: TorrentActionItem) => {
            if (selected.length === 0 && item.requiresTorrentSelection !== false) {
                return;
            }
            const bound = $rootScope.$btclient?.bindContextAction(item);
            if (bound && "click" in bound) {
                $scope.doContextAction(bound.click, bound.label, bound);
            }
        });

        $scope.$on("$destroy", () => {
            void window.electorrent.bittorrent.setSelectedTorrents([]);
        });

        function clearDeleteConfirmation() {
            $scope.deleteConfirmation = {
                action: null,
                removeAction: null,
                deleteDataAction: null,
                mode: "confirm",
                label: "",
                torrents: [],
            };
        }

        function getCurrentDetailsTorrent() {
            return detailsTorrent;
        }

        function syncDetailsPanel() {
            if (detailsTorrent) {
                detailsTorrent = $scope.torrents[detailsTorrent.id] || null;
            }
            $rootScope.$emit("torrentDetails:sync", getCurrentDetailsTorrent(), false);
            syncSelectedTorrents();
        }

        function openTorrentDetails(torrent: any) {
            const currentTorrent = torrent && $scope.torrents[torrent.id];
            if (!currentTorrent) return;
            detailsTorrent = currentTorrent;
            $rootScope.$emit("torrentDetails:open", currentTorrent);
        }

        function syncSelectedTorrents() {
            void window.electorrent.bittorrent.setSelectedTorrents(selected.map((torrent) => torrent.id));
        }

        function syncAfterTorrentMutation() {
            return $scope.update().catch((err: unknown) => {
                console.error("Torrent sync error", err);
                $notify.alert("Refresh failed", "The torrent list could not be refreshed");
            });
        }

        function openDeleteConfirmation(action: (torrents: any[]) => Promise<void>, label: string, torrents = selected) {
            $scope.deleteConfirmation = {
                action,
                mode: "confirm",
                label,
                torrents: torrents.slice(),
            };
            $scope.deleteModalref?.showModal();
        }

        function findContextActionByRole(items: any[], role: string): any | null {
            for (const item of items) {
                if (item.role === role) {
                    return item;
                }

                const nestedAction = findContextActionByRole(item.menu || [], role);
                if (nestedAction) {
                    return nestedAction;
                }
            }

            return null;
        }

        function getDeleteConfirmationTarget(torrents: any[]) {
            if (torrents.length !== 1) {
                return `${torrents.length} selected torrents`;
            }

            const [torrent] = torrents;
            return `"${torrent.decodedName || torrent.name || "this torrent"}"`;
        }

        $scope.getDeleteConfirmationMessage = () => {
            const label = ($scope.deleteConfirmation?.label || "Delete").toLowerCase();
            const torrents = $scope.deleteConfirmation?.torrents || [];
            if ($scope.deleteConfirmation?.mode === "remove-options") {
                if (!$scope.deleteConfirmation.deleteDataAction) {
                    return `Remove ${getDeleteConfirmationTarget(torrents)} from the client?`;
                }
                return `Choose whether to remove ${getDeleteConfirmationTarget(torrents)} from the client only or remove it with its downloaded files.`;
            }
            return `Are you sure you want to ${label} ${getDeleteConfirmationTarget(torrents)}?`;
        };

        $scope.cancelDelete = () => {
            clearDeleteConfirmation();
        };

        function runContextAction(action: ((torrents: any[]) => Promise<void>) | undefined, torrents: any[]) {
            if (!action) {
                return $q.resolve();
            }

            return action.call($rootScope.$btclient, torrents)
                .then(() => {
                    return syncAfterTorrentMutation();
                })
                .catch((err: unknown) => {
                    console.error("Context action error", err);
                    $notify.alert("Invalid action", "The action could not be performed because the server responded with a faulty reply");
                });
        }

        $scope.confirmDelete = () => {
            const pendingDelete = {
                action: $scope.deleteConfirmation?.action || null,
                torrents: ($scope.deleteConfirmation?.torrents || []).slice(),
            };
            clearDeleteConfirmation();
            return runContextAction(pendingDelete.action || undefined, pendingDelete.torrents);
        };

        $scope.confirmRemoveSelection = (deleteData: boolean) => {
            const confirmation = $scope.deleteConfirmation;
            const action = deleteData ? confirmation?.deleteDataAction : confirmation?.removeAction;
            const torrents = (confirmation?.torrents || []).slice();
            clearDeleteConfirmation();
            $scope.deleteModalref?.hideModal();
            return runContextAction(action || undefined, torrents);
        };

        $scope.removeSelected = () => {
            if (!selected.length) return $q.resolve();
            const torrentClient = $rootScope.$btclient;
            const configuredDeleteAction = findContextActionByRole(torrentClient?.contextMenu || [], "delete");
            const deleteDataAction = configuredDeleteAction?.deletesLocalData ? configuredDeleteAction : null;
            $scope.deleteConfirmation = {
                action: null,
                removeAction: torrentClient?.deleteTorrents || null,
                deleteDataAction: deleteDataAction?.click || null,
                mode: "remove-options",
                label: "Remove",
                torrents: selected.slice(),
            };
            $scope.deleteModalref?.showModal();
            return $q.resolve();
        };

        function remove() {
            const selectedTorrents = $scope.arrayTorrents.filter(({ selected: isSelected }: { selected: boolean }) => isSelected);
            if (selectedTorrents.length === 0) {
                return $q.resolve();
            }
            return $rootScope.$btclient?.deleteTorrents(selectedTorrents)
                .then(() => {
                    return syncAfterTorrentMutation();
                })
                .catch((err: unknown) => {
                    console.error("Remove torrents error", err);
                    $notify.alert("Invalid action", "The action could not be performed because the server responded with a faulty reply");
                });
        }

        function selectAll() {
            deselectAll();
            for (let index = 0; index < $scope.arrayTorrents.length; index += 1) {
                const torrent = $scope.arrayTorrents[index];
                torrent.selected = true;
                selected.push(torrent);
            }
            syncDetailsPanel();
            $scope.$apply();
        }

        function startTimer(fullupdate?: boolean) {
            if (reconnect) {
                $timeout.cancel(reconnect);
            }
            if (timeout) {
                $timeout.cancel(timeout);
            }
            timeout = $timeout(() => {
                $scope.update(fullupdate)
                    .then(() => {
                        startTimer();
                        $scope.connectionLost = false;
                        setSyncConnectionState("normal");
                    }).catch(() => {
                        $notify.alert("Connection lost", "Trying to reconnect");
                        $scope.connectionLost = true;
                        setSyncConnectionState("broken");
                        startReconnect();
                    });
            }, refreshRate);
        }

        function startReconnect() {
            $notify.disableAll();
            reconnect = $timeout(() => {
                $rootScope.$server?.connect()
                    .then(() => {
                        return $scope.update(true);
                    }).then(() => {
                        flushDeferredUploads();
                        $notify.enableAll();
                        $notify.ok("Reconnected", "The connection has been reestablished");
                        $scope.connectionLost = false;
                        setSyncConnectionState("normal");
                        startTimer(true);
                    }).catch((err: unknown) => {
                        startReconnect();
                        console.error(err);
                    });
            }, refreshRate);
        }

        function clearAll() {
            $scope.torrents = {};
            $scope.arrayTorrents = [];
            setLabels([]);
            if ($rootScope.$server?.id) {
                $rootScope.currentLabelsByServer = $rootScope.currentLabelsByServer || {};
                $rootScope.currentLabelsByServer[$rootScope.$server.id] = $scope.labels;
            }
            $scope.trackers = [];
        }

        function setLabels(labels: string[]) {
            $rootScope.labels = labels;
            $scope.labels = labels;
        }

        function resetAll() {
            clearAll();
            $scope.update(true);
        }

        function stopTimer() {
            if (timeout) {
                $timeout.cancel(timeout);
            }
            cancelSlowSyncTimer();
        }

        function cancelSlowSyncRequestTimer() {
            if (slowSyncTimer) {
                $timeout.cancel(slowSyncTimer);
                slowSyncTimer = undefined;
            }
        }

        function cancelSlowSyncTimer() {
            cancelSlowSyncRequestTimer();
            if (slowConnectionTimer) {
                $timeout.cancel(slowConnectionTimer);
                slowConnectionTimer = undefined;
            }
        }

        function getSyncConnectionStatus() {
            $rootScope.$syncConnection = $rootScope.$syncConnection || { state: "normal", responseTimes: [] };
            return $rootScope.$syncConnection;
        }

        function setSyncConnectionState(state: "normal" | "slow" | "broken", lastResponseTime?: number, slowThreshold?: number) {
            const status = getSyncConnectionStatus();
            status.state = state;
            if (typeof lastResponseTime === "number") {
                status.lastResponseTime = lastResponseTime;
            }
            if (typeof slowThreshold === "number") {
                status.slowThreshold = slowThreshold;
            }
            $rootScope.$applyAsync();
        }

        function scheduleSlowConnectionTimer(serverId?: string | number) {
            if (slowConnectionTimer) {
                $timeout.cancel(slowConnectionTimer);
            }
            const slowThreshold = getSlowSyncThreshold();
            slowConnectionTimer = $timeout(() => {
                if (!$scope.connectionLost && serverId === $rootScope.$server?.id) {
                    setSyncConnectionState("slow", undefined, slowThreshold);
                }
            }, refreshRate + slowThreshold);
        }

        function getSlowSyncThreshold() {
            const responseTimes = getSyncConnectionStatus().responseTimes;
            if (!responseTimes.length) {
                return MIN_SLOW_LATENCY_MS;
            }

            const sortedResponseTimes = responseTimes.slice().sort((left, right) => left - right);
            const medianResponseTime = sortedResponseTimes[Math.floor(sortedResponseTimes.length / 2)];
            return Math.min(MAX_SLOW_LATENCY_MS, Math.max(MIN_SLOW_LATENCY_MS, medianResponseTime * SLOW_LATENCY_FACTOR));
        }

        function trackSyncRequestLatency(startedAt: number, serverId?: string | number) {
            if (serverId !== $rootScope.$server?.id) {
                return;
            }

            const responseTime = Math.round(window.performance.now() - startedAt);
            if (slowConnectionTimer) {
                $timeout.cancel(slowConnectionTimer);
                slowConnectionTimer = undefined;
            }
            const status = getSyncConnectionStatus();
            status.responseTimes.push(responseTime);
            if (status.responseTimes.length > SYNC_LATENCY_SAMPLE_SIZE) {
                status.responseTimes.splice(0, status.responseTimes.length - SYNC_LATENCY_SAMPLE_SIZE);
            }
            setSyncConnectionState("normal", responseTime, getSlowSyncThreshold());
            scheduleSlowConnectionTimer(serverId);
        }

        $scope.filterByStatus = (status: string) => {
            deselectAll();
            detailsTorrent = null;
            $scope.filters.status = status;
            $scope.torrentLimit = LIMIT;
            refreshTorrents();
            syncDetailsPanel();
        };

        $scope.filterBySearch = () => {
            $scope.isSearching = true;
            deselectAll();
            detailsTorrent = null;
            $scope.torrentLimit = LIMIT;
            refreshTorrents();
            syncDetailsPanel();
        };

        $scope.filterByLabel = (label?: string) => {
            deselectAll();
            detailsTorrent = null;
            $scope.filters.label = label;
            $scope.torrentLimit = LIMIT;
            refreshTorrents();
            syncDetailsPanel();
        };

        $scope.filterByTracker = (tracker?: string) => {
            deselectAll();
            detailsTorrent = null;
            $scope.filters.tracker = tracker;
            $scope.torrentLimit = LIMIT;
            refreshTorrents();
            syncDetailsPanel();
        };

        $scope.showContextMenu = (event: Event, torrent: any) => {
            const contextActionTorrents = torrent.selected ? selected.slice() : [torrent];
            $scope.contextMenu.show(event, contextActionTorrents);
        };

        $scope.openTorrentDetails = (torrent: any) => {
            openTorrentDetails(torrent);
        };

        $scope.noneSelected = () => {
            return selected.length === 0;
        };
        $scope.selectedCount = () => selected.length;

        function toggleSelect(target: any) {
            const torrent = $scope.torrents[target.id];
            if (!torrent.selected) {
                selected.push(torrent);
            } else {
                selected = selected.filter((item) => {
                    return item.id !== torrent.id;
                });
            }
            torrent.selected = !torrent.selected;
            syncDetailsPanel();
        }

        function deselectAll() {
            for (let index = 0; index < selected.length; index += 1) {
                selected[index].selected = false;
            }
            selected = [];
        }

        $scope.setSelected = (event: MouseEvent, torrent: any) => {
            openTorrentDetails(torrent);

            (event.currentTarget as HTMLElement).closest("table")?.focus({ preventScroll: true });
        };

        $scope.toggleTerminalSelection = (event: MouseEvent, torrent: any) => {
            event.stopPropagation();
            toggleSelect(torrent);
            (event.currentTarget as HTMLElement).closest("table")?.focus({ preventScroll: true });
        };

        $scope.navigateSelection = (event: KeyboardEvent) => {
            if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || $scope.arrayTorrents.length === 0) {
                return;
            }

            event.preventDefault();
            const direction = event.key === "ArrowUp" ? -1 : 1;
            const selectedIndexes = $scope.arrayTorrents.reduce((indexes: number[], torrent: any, index: number) => {
                if (torrent.selected) {
                    indexes.push(index);
                }
                return indexes;
            }, []);
            const currentIndex = selectedIndexes.length === 0
                ? (direction < 0 ? $scope.arrayTorrents.length : -1)
                : (direction < 0 ? Math.min(...selectedIndexes) : Math.max(...selectedIndexes));
            const targetIndex = Math.max(0, Math.min(currentIndex + direction, $scope.arrayTorrents.length - 1));
            const target = $scope.arrayTorrents[targetIndex];

            if (event.shiftKey && selectedIndexes.length > 0) {
                if (!target.selected) {
                    target.selected = true;
                    selected.push(target);
                    syncDetailsPanel();
                }
            } else {
                openTorrentDetails(target);
            }
            $scope.torrentLimit = Math.max($scope.torrentLimit, targetIndex + 1);
            $timeout(() => {
                document.querySelector<HTMLElement>(`#torrentTable tbody tr[data-id="${target.id.toLowerCase()}"]`)
                    ?.scrollIntoView({ block: "nearest" });
            });
        };

        $scope.doAction = (action: any, name: string, data: any, ...args: any[]) => {
            return action.call($rootScope.$btclient, selected, data, ...args)
                .then(() => {
                    return syncAfterTorrentMutation();
                })
                .catch((err: unknown) => {
                    console.error("Action error", err);
                    $notify.alert("Invalid action", "The action could not be performed because the server responded with a faulty reply");
                });
        };

        $scope.doAllAction = (role: string) => {
            const client = $rootScope.$btclient;
            const item = client.actionHeader.find((action: any) => action.role === role);
            if (!item || item.type !== "button" || !$scope.arrayTorrents.length) return;
            return item.click.call(client, $scope.arrayTorrents.slice())
                .then(() => syncAfterTorrentMutation())
                .catch((err: unknown) => {
                    console.error("Session action error", err);
                    $notify.alert("Invalid action", "The session action could not be performed");
                });
        };

        $scope.syncAfterTorrentMutation = () => {
            return syncAfterTorrentMutation();
        };

        $scope.setAlternativeSpeedLimitsMode = (enabled: boolean) => {
            return $rootScope.$btclient.setAlternativeSpeedLimitsMode(enabled)
                .then(() => syncAfterTorrentMutation())
                .catch((err: unknown) => {
                    console.error("Alternative speed limits error", err);
                    $notify.alert("Invalid action", "The alternative rate limits mode could not be changed");
                });
        };

        $scope.doContextAction = (action: any, label: string, item: any, contextTorrents?: any[]) => {
            const actionTorrents = contextTorrents?.length ? contextTorrents : selected;
            if (item?.role === "details") {
                openTorrentDetails(actionTorrents[0] || detailsTorrent || selected[0]);
                return $q.resolve();
            }
            if (item?.role === "set-location") {
                if (actionTorrents.length >= 1) {
                    $scope.setLocationModalRef?.open(actionTorrents.slice());
                }
                return $q.resolve();
            }
            if (item?.role === "set-label") {
                if (actionTorrents.length >= 1) {
                    $scope.setLabelModalRef?.open(actionTorrents.slice());
                }
                return $q.resolve();
            }
            if (item?.role === "set-speed-limits") {
                if (actionTorrents.length >= 1) {
                    $scope.speedLimitModalRef?.open(actionTorrents.slice());
                }
                return $q.resolve();
            }
            if (item?.role === "set-ratio") {
                if (actionTorrents.length >= 1) {
                    $scope.setRatioModalRef?.open(actionTorrents.slice());
                }
                return $q.resolve();
            }
            if (item && item.role === "delete" && settings.confirmTorrentDeletion !== false) {
                openDeleteConfirmation(action, label, actionTorrents);
                return $q.resolve();
            }
            return runContextAction(action, actionTorrents);
        };

        function fetchTorrents(): any[] {
            return Array.from(Object.values($scope.torrents)) as any[];
        }

        $scope.changeSorting = ({ sortKey, descending }: SortChange) => {
            $scope.torrentLimit = LIMIT;
            $scope.filters.sort = sortKey;
            $scope.filters.order = descending;
            refreshTorrents();
        };

        function torrentSorter() {
            const sort = $scope.filters.sort || "dateAdded";
            const desc = $scope.filters.order;

            const column = $rootScope.$server?.columns.find((value: any) => value.attribute === sort);
            const sorter = column.sort;

            const alphabeticalCompare = (left?: string, right?: string) => {
                return (left || "").toLowerCase().localeCompare((right || "").toLowerCase());
            };

            const compareProgressState = (a: any, b: any) => {
                if (sort !== "percent" || a.percent !== b.percent) {
                    return 0;
                }

                const stateCompare = alphabeticalCompare(a.statusText?.(), b.statusText?.());
                if (stateCompare !== 0) {
                    return stateCompare;
                }

                return alphabeticalCompare(a.decodedName || a.name, b.decodedName || b.name);
            };

            const descSort = (a: any, b: any) => {
                return sorter(a[sort], b[sort]) || compareProgressState(a, b);
            };

            const ascSort = (a: any, b: any) => {
                return (sorter(a[sort], b[sort]) * (-1)) || compareProgressState(a, b);
            };

            if (desc) {
                return descSort;
            }
            return ascSort;
        }

        function statusFilter(torrent: any, status: string) {
            switch (status) {
                case "all": return true;
                case "active": return torrent.isStatusDownloading() || torrent.isStatusSeeding() || torrent.isStatusQueued();
                case "finished": return torrent.isStatusCompleted();
                case "downloading": return torrent.isStatusDownloading();
                case "paused": return torrent.isStatusPaused();
                case "queued": return torrent.isStatusQueued();
                case "seeding": return torrent.isStatusSeeding();
                case "error": return torrent.isStatusError();
                case "stopped": return torrent.isStatusStopped();
                default: return false;
            }
        }

        function trackerFilter(filterTracker: string) {
            return function filterTrackerFn(torrent: any) {
                return torrent.trackers && torrent.trackers.some((tracker: string) => {
                    return tracker && tracker.includes(filterTracker);
                });
            };
        }

        function torrentFilter(status?: string, label?: string, tracker?: string) {
            const filterStatus = status || $scope.filters.status;
            const filterLabel = label || $scope.filters.label;
            const filterTracker = tracker || $scope.filters.tracker;
            const filters: Array<(torrent: any) => boolean> = [];

            if (filterStatus) {
                filters.push((torrent) => statusFilter(torrent, filterStatus));
            }

            if (filterLabel) {
                filters.push((torrent) => matchesLabelFilter(torrent.label, filterLabel));
            }

            if (filterTracker) {
                filters.push(trackerFilter(filterTracker));
            }

            return function torrentFilterFn(torrent: any) {
                return filters.every((filter) => {
                    return filter(torrent);
                });
            };
        }

        function fuzzySearch(torrents: any[], search?: string) {
            if ($scope.filters.search) {
                const value = search || $scope.filters.search;
                fuse.setCollection(torrents);
                const matchingInfoHashes = torrents.filter((torrent) => {
                    return typeof torrent.hash === "string"
                        && torrent.hash.toLowerCase().includes(value.toLowerCase());
                });
                return Array.from(new Set([...fuse.search(value), ...matchingInfoHashes]));
            }
            return torrents;
        }

        function refreshTorrents() {
            const allTorrents = fetchTorrents();
            let torrents = allTorrents;
            torrents = torrents.filter(torrentFilter());
            torrents = fuzzySearch(torrents);
            torrents = torrents.sort(torrentSorter());
            $scope.isSearching = false;
            $scope.arrayTorrents = torrents;
            $scope.totalDownloadSpeed = allTorrents.reduce((acc: number, { downloadSpeed }: { downloadSpeed: number }) => acc + downloadSpeed, 0);
            $scope.totalUploadSpeed = allTorrents.reduce((acc: number, { uploadSpeed }: { uploadSpeed: number }) => acc + uploadSpeed, 0);
            $scope.totalDownloaded = allTorrents.reduce((acc: number, { downloaded }: { downloaded: number }) => acc + downloaded, 0);
            $scope.totalUploaded = allTorrents.reduce((acc: number, { uploaded }: { uploaded: number }) => acc + uploaded, 0);
            $scope.connectedPeers = allTorrents.reduce((acc: number, torrent: any) => acc + (torrent.peersConnected || 0), 0);
            $scope.activeTorrentCount = allTorrents.filter((torrent: any) => (torrent.isStatusDownloading() || torrent.isStatusSeeding())).length;
            recordDeckHistory();
            downloadHistory.push($scope.totalDownloadSpeed);
            uploadHistory.push($scope.totalUploadSpeed);
            if (downloadHistory.length > 12) downloadHistory.shift();
            if (uploadHistory.length > 12) uploadHistory.shift();
            $scope.downloadChart = chartPoints(downloadHistory);
            $scope.uploadChart = chartPoints(uploadHistory);
        }

        function reassignSelected() {
            const newSelected: any[] = [];
            selected.forEach((torrent) => {
                const delegate = $scope.torrents[torrent.id];
                if (delegate) {
                    delegate.selected = true;
                    newSelected.push(delegate);
                }
            });
            selected = newSelected;
            if (detailsTorrent) {
                detailsTorrent = $scope.torrents[detailsTorrent.id] || null;
            }
        }

        function clearDeletedSelections(deletedIds: string[]) {
            const deletedIdSet = new Set(deletedIds);

            selected = selected.filter((torrent) => {
                if (deletedIdSet.has(torrent.id)) {
                    torrent.selected = false;
                    return false;
                }

                return true;
            });

            if (detailsTorrent && deletedIdSet.has(detailsTorrent.id)) {
                detailsTorrent = null;
            }
        }

        let initialSnapshotRendered = false;

        $scope.update = (fullupdate?: boolean) => {
            const serverId = $rootScope.$server?.id;
            const request = $rootScope.$btclient?.torrents(!!fullupdate);
            const startedAt = window.performance.now();
            const slowThreshold = getSlowSyncThreshold();
            cancelSlowSyncRequestTimer();
            slowSyncTimer = $timeout(() => {
                if (!$scope.connectionLost && serverId === $rootScope.$server?.id) {
                    setSyncConnectionState("slow", undefined, slowThreshold);
                }
            }, slowThreshold);

            return request.then((torrents: any) => {
                cancelSlowSyncRequestTimer();
                trackSyncRequestLatency(startedAt, serverId);
                if (serverId !== $rootScope.$server?.id) {
                    return;
                }
                if (torrents.sessionStats) $scope.sessionStats = torrents.sessionStats;
                newTorrents(torrents);
                deleteTorrents(torrents);
                changeTorrents(torrents);
                updateLabels(torrents);
                updateTrackers(torrents);
                if ($rootScope.$btclient?.features?.freeDiskSpace && Object.prototype.hasOwnProperty.call(torrents, "freeDiskSpace")) {
                    $scope.freeDiskSpace = torrents.freeDiskSpace ?? null;
                }
                if (Object.prototype.hasOwnProperty.call(torrents, "alternativeSpeedLimitsEnabled")) {
                    $scope.alternativeSpeedLimitsEnabled = torrents.alternativeSpeedLimitsEnabled === true;
                }
            }).then(() => {
                syncDetailsPanel();
                // Do not rely solely on ngRepeat's repeat-done callback to
                // remove the app-shell loading overlay. Some client responses
                // update the torrent list without causing that callback to run.
                if (!initialSnapshotRendered) {
                    initialSnapshotRendered = true;
                    $scope.renderDone();
                }
            }).catch((err: unknown) => {
                cancelSlowSyncTimer();
                setSyncConnectionState("broken");
                $scope.renderDone();
                return $q.reject(err);
            });
        };

        function checkNotification(oldTorrent: any, updatedTorrent: any) {
            if (!oldTorrent || !updatedTorrent) {
                return;
            }
            if (updatedTorrent.percent === 1000 && oldTorrent.percent < 1000) {
                if (settings.ui.notifications === true) {
                    $notify.torrentComplete(oldTorrent);
                }
            }
        }

        function newTorrents(torrents: any) {
            if ((torrents.all && torrents.all.length > 0) || torrents.dirty === true) {
                const torrentMap: Record<string, any> = {};
                for (let index = 0; index < torrents.all.length; index += 1) {
                    const torrent = torrents.all[index];
                    torrentMap[torrent.id] = torrent;
                    const oldTorrent = $scope.torrents[torrent.id];
                    checkNotification(oldTorrent, torrent);
                }
                $scope.torrents = torrentMap;
                reassignSelected();
                refreshTorrents();
            }
        }

        function deleteTorrents(torrents: any) {
            if (torrents.deleted && torrents.deleted.length > 0) {
                clearDeletedSelections(torrents.deleted);
                for (let index = 0; index < torrents.deleted.length; index += 1) {
                    delete $scope.torrents[torrents.deleted[index]];
                }
                refreshTorrents();
            }
        }

        function changeTorrents(torrents: any) {
            if (torrents.changed && torrents.changed.length > 0) {
                for (let index = 0; index < torrents.changed.length; index += 1) {
                    const torrent = torrents.changed[index];
                    const existing = $scope.torrents[torrent.id];
                    checkNotification(existing, torrent);

                    if (existing) {
                        existing.update(torrent);
                    } else {
                        $scope.torrents[torrent.id] = torrent;
                    }
                }
                refreshTorrents();
            }
        }

        function updateLabels(torrents: any) {
            if (torrents.labels && torrents.labels.length > 0) {
                torrents.labels.forEach((label: string) => {
                    if (!$scope.labels.includes(label)) {
                        $scope.labels.push(label);
                    }
                });
            }

            if ($rootScope.$server?.id) {
                $rootScope.currentLabelsByServer = $rootScope.currentLabelsByServer || {};
                $rootScope.currentLabelsByServer[$rootScope.$server.id] = $scope.labels;
            }
        }

        function updateTrackers(torrents: any) {
            if (Array.isArray(torrents.trackers)) {
                $scope.trackers = torrents.trackers;
            }
        }
    }
}
