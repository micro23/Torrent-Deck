import { IScope } from "angular";
import type { PendingTorrentUploadFile } from "@renderer/app/directives/add-torrent-modal/add-torrent-modal.directive";
import type { ElectorrentRootScope } from "@renderer/app/types/root-scope";
import type { MenuAction } from "@shared/ipc-contract";
import { DEFAULT_CONTENT_SCALE, normalizeContentScale } from "@shared/content-scale";

interface MenuActionHandlerOptions {
    $rootScope: ElectorrentRootScope;
    $scope: IScope;
    $bittorrent: any;
    settingsService: any;
    currentPage: () => string | null;
}

const PAGE_TORRENTS = "torrents";

export function createMenuActionHandler({
    $rootScope,
    $scope,
    $bittorrent,
    settingsService,
    currentPage,
}: MenuActionHandlerOptions) {
    const electorrent = window.electorrent;

    const getActiveTextInput = () => {
        return document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
            ? document.activeElement
            : null;
    };

    const broadcastTorrentFile = (file: PendingTorrentUploadFile, askUploadOptions: boolean) => {
        const pendingFile: PendingTorrentUploadFile = {
            type: "file",
            data: new Uint8Array(file.data),
            filename: file.filename,
            metadata: file.metadata,
            sourcePath: file.sourcePath,
        };
        $rootScope.$broadcast("torrents:add", pendingFile, askUploadOptions);
    };

    return (action: MenuAction) => {
        switch (action.type) {
            case "content-scale": {
                const settings = settingsService.getAllSettings();
                const current = normalizeContentScale(settings.ui.contentScale);
                settings.ui.contentScale = action.change === "reset" ? DEFAULT_CONTENT_SCALE
                    : normalizeContentScale(current + (action.change === "increase" ? 10 : -10));
                $rootScope.$applyAsync();
                void settingsService.saveAllSettings().catch((error: unknown) => console.error("Could not save content size", error));
                break;
            }
            case "show-settings":
                $scope.$emit("show:settings");
                break;
            case "show-servers":
                $scope.$emit("show:servers");
                break;
            case "search-torrent":
                $rootScope.$broadcast("search:torrent");
                break;
            case "select-all":
                {
                    const activeTextInput = getActiveTextInput();
                    if (activeTextInput) {
                        activeTextInput.select();
                    } else if (currentPage() === PAGE_TORRENTS) {
                        $rootScope.$broadcast("select:torrents");
                    }
                }
                break;
            case "remove-selected":
                if (document.activeElement?.nodeName !== "INPUT" && currentPage() === PAGE_TORRENTS) {
                    $rootScope.$broadcast("remove:torrents");
                }
                break;
            case "remove-and-delete-selected":
                if (document.activeElement?.nodeName !== "INPUT" && currentPage() === PAGE_TORRENTS) {
                    $rootScope.$broadcast("remove-and-delete:torrents");
                }
                break;
            case "open-add-torrent":
                electorrent.torrents.openFiles(true).then((files: Array<PendingTorrentUploadFile & { askUploadOptions?: boolean }>) => {
                    files.forEach((item) => broadcastTorrentFile(item, true));
                }).catch((error: unknown) => {
                    $rootScope.$emit("notification", {
                        title: "Could not open torrent files",
                        message: error instanceof Error ? error.message : String(error),
                        type: "negative",
                    });
                }).finally(() => {
                    $scope.$applyAsync();
                });
                break;
            case "paste-torrent-url":
                $bittorrent.uploadFromClipboard(!!action.askUploadOptions);
                break;
            case "open-external":
                electorrent.shell.openExternal(action.url);
                break;
            case "check-for-updates":
                electorrent.updates.check(!!action.verbose);
                break;
            case "claim-torrent-files":
                void electorrent.app.claimTorrentFiles();
                break;
            case "connect-server":
                {
                    const server = settingsService.getServer(action.serverId);
                    if (server) {
                        $scope.$emit("connect:server", server);
                    }
                }
                break;
            case "set-current-default-server":
                settingsService.setCurrentServerAsDefault();
                break;
            case "add-server":
                $scope.$emit("add:server");
                break;
            case "torrent-action":
                $rootScope.$broadcast("torrent-action", action.action);
                break;
            default:
                break;
        }
        $scope.$applyAsync();
    };
}
