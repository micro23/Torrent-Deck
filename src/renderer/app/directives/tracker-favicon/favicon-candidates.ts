// Keep the WebUI's tracker roots and candidate order in sync. Never pass an
// announce path, credentials or passkey to an external icon cache.
const TRACKER_ROOTS = new Set([
    "torrentleech.org", "funfile.org", "iptorrents.com", "torrentday.com", "filelist.io",
    "speedapp.io", "alpharatio.cc", "myanonamouse.net", "redacted.ch", "orpheus.network",
    "broadcasthe.net", "karagarga.in", "avistaz.to", "cinemaz.to", "animetorrents.me",
    "beyond-hd.me", "hd-space.org", "hd-torrents.org", "blutopia.cc", "aither.cc",
    "fearnopeer.com", "oldtoons.world", "morethantv.me", "digitalcore.club", "privatehd.to",
    "torrentseeds.org", "pretome.net", "torrentbytes.net", "revolutiontt.me", "passthepopcorn.me",
    "thepiratebay.org", "1337x.to", "yts.mx", "nyaa.si", "eztv.re", "torrentgalaxy.to",
    "limetorrents.lol", "torlock.com", "zooqle.com", "torrentdownloads.pro", "solidtorrents.to",
    "magnetdl.com", "academictorrents.com", "archive.org", "opentrackr.org", "openbittorrent.com",
    "demonii.com", "explodie.org", "udp-tracker.org", "leechers-paradise.org",
])

export function trackerFaviconCandidates(value: string): string[] {
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
        const domain = url.hostname.toLowerCase().replace(/^www\./, "")
        const privateIpv4 = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(domain)
        if (!domain.includes(".") || domain.includes(":") || privateIpv4 || /\.(?:local|internal|lan|home|test|localhost)$/.test(domain)) return []
        const root = domain.replace(/^(?:tracker|announce|open|udp|http|https)\./, "")
        return [...new Set([
            TRACKER_ROOTS.has(domain) ? `https://${domain}/favicon.ico` : "",
            TRACKER_ROOTS.has(root) ? `https://${root}/favicon.ico` : "",
            `https://${domain}/favicon.ico`,
            root !== domain ? `https://${root}/favicon.ico` : "",
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(root)}.ico`,
        ].filter(Boolean))]
    } catch {
        return []
    }
}
