import { Column } from '@renderer/app/services/column'

/**
 * Represents a single file inside a torrent. Used for file list display and
 * selective download (wanted/unwanted). Index is the client API file index.
 */
export interface TorrentFile {
    index: number
    path: string
    name: string
    size: number
    wanted: boolean
    priority?: number
}

export interface TorrentProps {
    id: string
    hash: string
    status?: number
    name?: string
    size?: number
    percent?: number
    downloaded?: number
    uploaded?: number
    ratio?: number
    ratioLimit?: number
    uploadSpeed?: number
    downloadSpeed?: number
    uploadLimit?: number
    downloadLimit?: number
    eta?: number
    label?: string
    peersConnected?: number
    peersInSwarm?: number
    seedsConnected?: number
    seedsInSwarm?: number
    torrentQueueOrder?: number
    statusMessage?: string
    dateAdded?: number
    dateCompleted?: number
    savePath?: string
    props?: Record<string, any>
}

export abstract class Torrent implements TorrentProps {

    // Specific fields
    selected: boolean
    isStarred: boolean
    decodedName: string
    cleanedName: string

    // Inherited fields
    id: string
    hash: string
    status: number
    name: string
    size: number
    percent: number
    downloaded: number
    uploaded: number
    ratio: number
    ratioLimit: number
    uploadSpeed: number
    downloadSpeed: number
    uploadLimit: number
    downloadLimit: number
    eta: number
    label: string
    peersConnected: number
    peersInSwarm: number
    seedsConnected: number
    seedsInSwarm: number
    torrentQueueOrder: number
    statusMessage: string
    dateAdded: number
    dateCompleted: number
    savePath: string
    props: Record<string, any>


    constructor(props: TorrentProps) {
        for (const p in props) {
            this[p] = props[p]
        }
        this.selected = false;
        this.isStarred = false;
        this.decodedName = this.decodeName(this.name);
        this.cleanedName = this.cleanName(this.decodedName);
    }

    private decodeName(name: string) {
        if(!name) return undefined

        return name.replace(/[._]/g, ' ').replace(/(\[[^\]]*\])(.*)$/, '$2 $1').trim();
    };

    private cleanName(name: string) {
        if(!name) return undefined

        return name.toLowerCase().replace(/s?([0-9]{1,2})[x|e|-]([0-9]{1,2})/, '').replace(
            /(bdrip|brrip|cam|dttrip|dvdrip|dvdscr|dvd|fs|hdtv|hdtvrip|hq|pdtv|satrip|dvbrip|r5|r6|ts|tc|tvrip|vhsrip|vhsscr|ws|aac|ac3|dd|dsp|dts|lc|ld|md|mp3|xvid|720p|1080p|fs|internal|limited|proper|stv|subbed|tma|tnz|silent|tls|gbm|fsh|rev|trl|upz|unrated|webrip|ws|mkv|avi|mov|mp4|mp3|iso|x264|x265|h264|h265)/g,
            '').trim();
    };


    update(other: Torrent) {
        for(const k in other) {
            if(Object.prototype.hasOwnProperty.call(other, k) && k !== 'selected') {
                if(other[k] !== undefined) {
                    this[k] = other[k];
                }
            }
        }
    };

    getMagnetURI(longUri: string) {
        let link = 'magnet:?xt=urn:btih:' + this.hash;
        if(longUri) {
            link += '&dn=' + encodeURIComponent(this.name);
            link += '&xl=' + encodeURIComponent(this.size);

            if(this.props && this.props.trackers) {
                const trackers = this.props.trackers.split('\r\n');
                for(let i = 0; i < trackers.length; i++) {
                    if(trackers[i].length > 0) {
                        link += '&tr=' + encodeURIComponent(trackers[i]);
                    }
                }
            }
        }
        return link;
    };

    trackerFaviconUrl(): string {
        const torrent = this as Torrent & { tracker?: unknown; trackerHost?: unknown; trackers?: unknown; trackerFavicon?: unknown }
        const candidates: unknown[] = [torrent.trackerFavicon, torrent.trackerHost, torrent.tracker]
        if (Array.isArray(torrent.trackers)) {
            candidates.push(...torrent.trackers.map((tracker: unknown) => {
                if (typeof tracker === "string") return tracker
                if (tracker && typeof tracker === "object") {
                    const entry = tracker as Record<string, unknown>
                    return entry.announce || entry.url || entry.host
                }
                return undefined
            }))
        }
        if (typeof this.props?.trackers === "string") candidates.push(...this.props.trackers.split(/[\r\n]+/))

        for (const candidate of candidates) {
            const tracker = Array.isArray(candidate) ? candidate[0] : candidate
            if (typeof tracker !== "string" || !tracker.trim()) continue

            try {
                const value = tracker.trim()
                const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
                const hostname = url.hostname.toLowerCase()
                const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname)
                const privateSuffix = /\.(?:local|internal|lan|home|test|localhost)$/.test(hostname)
                if (!hostname.includes(".") || hostname === "localhost" || privateIpv4 || privateSuffix) continue
                return `https://${hostname}/favicon.ico`
            } catch {
                // Some clients expose a display label instead of a tracker URL.
            }
        }

        return ""
    }


    abstract isStatusError(): boolean;
    abstract isStatusPaused(): boolean;
    abstract isStatusQueued(): boolean;
    abstract isStatusCompleted(): boolean;
    abstract isStatusDownloading(): boolean;
    abstract isStatusSeeding(): boolean;
    abstract isStatusStopped(): boolean;

    /** True while a client verifies torrent data or resume metadata. */
    isStatusChecking(): boolean {
        return false;
    }

    getPercentStr(): string {
        const percent = Math.floor(Math.min(this.percent || 0, 1000)) / 10;
        return percent.toFixed(1) + '%';
    };

    statusColor(): string {
        if (this.isStatusChecking()){
            return 'blue';
        } else if (this.isStatusError()){
            return 'error';
        } else if (this.isStatusPaused()){
            return 'grey';
        } else if (this.isStatusSeeding()){
            return 'orange';
        } else if (this.isStatusQueued()){
            return 'yellow'
        } else if (this.isStatusDownloading()){
            return 'blue';
        } else if (this.isStatusCompleted()){
            return 'success';
        } else {
            return 'disabled';
        }
    };

    manualStatusText(): string {
        if (this.isStatusChecking()){
            return 'Checking';
        } else if (this.isStatusError()){
            return 'Error';
        } else if (this.isStatusPaused()){
            return 'Paused';
        } else if (this.isStatusStopped()){
            return 'Stopped';
        } else if (this.isStatusSeeding()){
            return 'Seeding';
        } else if (this.isStatusQueued()){
            return 'Queued';
        } else if (this.isStatusDownloading()){
            return 'Downloading';
        } else if (this.isStatusCompleted()){
            return 'Finished';
        } else {
            return 'Unknown';
        }
    };

    statusText(): string {
        const statusRegex = /[^a-zA-Z(): ]/g;
        if (this.isStatusChecking()) return 'Checking';
        if (!this.statusMessage) return this.manualStatusText();
        return this.statusMessage.replace(statusRegex, '');
    };

    seedsText(): string {
        if (Number.isInteger(this.seedsConnected) && Number.isInteger(this.seedsInSwarm)) {
            return this.seedsConnected + ' of ' + this.seedsInSwarm
        } else {
            return ''
        }
    }

    peersText(): string {
        if (Number.isInteger(this.peersConnected) && Number.isInteger(this.peersInSwarm)) {
            return this.peersConnected + ' of ' + this.peersInSwarm
        } else {
            return ''
        }
    }

    queueText(): string {
        if (Number.isInteger(this.torrentQueueOrder) && this.torrentQueueOrder >= 0) {
            return this.torrentQueueOrder.toString()
        } else {
            return ''
        }
    }

    static sort(attribute: keyof Torrent) {
        switch (attribute) {
            case 'decodedName': return Torrent.alphabetical
            case 'label': return Torrent.alphabetical
            case 'torrentQueueOrder': return Torrent.naturalNumberAsc
            case 'eta': return Torrent.naturalNumberAsc
            default: return Torrent.numerical
        }
    }

    static COL_NAME = new Column({
      name: 'Torrent',
      enabled: true,
      template: '<span class="terminal-name-cell"><button type="button" class="terminal-row-check" ng-click="toggleTerminalSelection($event, torrent)" ng-attr-aria-pressed="{{torrent.selected}}" aria-label="Select torrent">{{torrent.selected ? "[✓]" : "[ ]"}}</button><span class="deck-row-state" ng-attr-title="{{torrent.manualStatusText()}}"><i class="icon" ng-class="{\'arrow down\': torrent.isStatusDownloading() && !torrent.isStatusChecking(), \'arrow up\': torrent.isStatusSeeding() && !torrent.isStatusChecking(), \'pause\': (torrent.isStatusPaused() || torrent.isStatusStopped()) && !torrent.isStatusChecking(), \'clock\': torrent.isStatusQueued() && !torrent.isStatusChecking(), \'refresh\': torrent.isStatusChecking(), \'exclamation triangle\': torrent.isStatusError()}"></i></span><img class="tracker-favicon-small" ng-if="torrent.trackerFaviconUrl()" ng-src="{{torrent.trackerFaviconUrl()}}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy" hide-broken-image><span class="torrent-name-content">{{settings.ui.cleanNames ? torrent.decodedName : torrent.name}}</span></span>',
      attribute: 'decodedName',
      sort: Column.ALPHABETICAL
    })

    static COL_STATE = new Column({
      name: 'State',
      enabled: true,
      template: '{{torrent.manualStatusText()}}',
      attribute: 'statusMessage',
      sort: Column.ALPHABETICAL
    })

    static COL_SIZE = new Column({
      name: 'Size',
      enabled: true,
      template: '{{torrent.size | bytes}}',
      attribute: 'size'
    })

    static COL_DOWNSPEED = new Column({
      name: '↓ Download',
      enabled: true,
      template: '{{torrent.downloadSpeed | speed}}',
      attribute: 'downloadSpeed'
    })

    static COL_UPSPEED = new Column({
      name: '↑ Upload',
      enabled: true,
      template: '{{torrent.uploadSpeed | speed}}',
      attribute: 'uploadSpeed'
    })

    static COL_UPLOAD_TOTAL = new Column({
      name: 'Uploaded',
      enabled: true,
      template: '{{torrent.uploaded | bytes}}',
      attribute: 'uploaded'
    })

    static COL_DOWNLIMIT = new Column({
      name: 'Down Limit',
      enabled: false,
      template: '{{torrent.downloadLimit | speedLimit}}',
      attribute: 'downloadLimit'
    })

    static COL_UPLIMIT = new Column({
      name: 'Up Limit',
      enabled: false,
      template: '{{torrent.uploadLimit | speedLimit}}',
      attribute: 'uploadLimit'
    })

    static COL_PROGRESS = new Column({
      name: 'Progress',
      enabled: true,
      template: '<div progress="torrent"></div>',
      attribute: 'percent'
    })

    static COL_LABEL = new Column({
      name: 'Label',
      enabled: false,
      template: '<span class="torrent-table-label-chip" ng-if="torrent.label" label-chip="torrent.label"><span class="label-chip-text">{{torrent.label}}</span></span>',
      attribute: 'label',
      sort: Column.ALPHABETICAL
    })

    static COL_DATEADDED = new Column({
      name: 'Date Added',
      enabled: false,
      template: '<span time="torrent.dateAdded"></span>',
      attribute: 'dateAdded'
    })

    static COL_DATECOMPLETED = new Column({
      name: 'Date Completed',
      enabled: false,
      template: '<span time="torrent.dateCompleted"></span>',
      attribute: 'dateCompleted'
    })

    static COL_PEERS = new Column({
      name: 'Peers',
      enabled: true,
      template: '{{torrent.peersText()}}',
      attribute: 'peersConnected'
    })

    static COL_SEEDS = new Column({
      name: 'Seeds',
      enabled: true,
      template: '{{torrent.seedsText()}}',
      attribute: 'seedsConnected'
    })

    static COL_QUEUE = new Column({
      name: 'Queue',
      enabled: false,
      template: '{{torrent.torrentQueueOrder | torrentQueue}}',
      attribute: 'torrentQueueOrder',
      sort: Column.NATURAL_NUMBER_ASC
    })

    static COL_ETA = new Column({
      name: 'ETA',
      enabled: true,
      template: '{{torrent.eta | eta}}',
      attribute: 'eta',
      sort: Column.NATURAL_NUMBER_ASC
    })

    static COL_RATIO = new Column({
      name: 'Ratio',
      enabled: true,
      template: '{{torrent.ratio | torrentRatio}}',
      attribute: 'ratio'
    })

    static COL_SEEDING_TIME = new Column({
      name: 'Seed Time',
      enabled: true,
      template: '{{torrent.seedingTime | eta}}',
      attribute: 'seedingTime',
      sort: Column.NATURAL_NUMBER_ASC
    })

    static COL_RATIO_LIMIT = new Column({
      name: 'Ratio Limit',
      enabled: false,
      template: '{{torrent.ratioLimit | torrentRatio}}',
      attribute: 'ratioLimit'
    })

    static COLUMNS = [
        Torrent.COL_NAME,
        Torrent.COL_STATE,
        Torrent.COL_SIZE,
        Torrent.COL_PROGRESS,
        Torrent.COL_DOWNSPEED,
        Torrent.COL_UPSPEED,
        Torrent.COL_ETA,
        Torrent.COL_RATIO,
        Torrent.COL_SEEDS,
        Torrent.COL_PEERS,
        Torrent.COL_SEEDING_TIME,
        Torrent.COL_UPLOAD_TOTAL,
        Torrent.COL_LABEL,
        Torrent.COL_DATEADDED,
        Torrent.COL_DATECOMPLETED,
        Torrent.COL_QUEUE,
        Torrent.COL_RATIO_LIMIT
    ]

    private static alphabetical(a: string, b: string) {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        return aLower.localeCompare(bLower);
    }

    private static numerical(a: number, b: number){
        return b - a;
    }

    private static naturalNumberAsc(a: number, b: number){
        if (a < 1) return 1
        if (b < 1) return -1
        return a - b
    }
}
