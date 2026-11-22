interface OceanTorrent {
    percent: number
    downloadSpeed: number
    uploadSpeed: number
    isStatusDownloading(): boolean
    isStatusSeeding(): boolean
    isStatusPaused(): boolean
}

export const OCEAN_SECTORS = [
    { label: "Downloading", key: "downloading", color: "#87efcc" },
    { label: "Seeding", key: "seeding", color: "#b8d5ff" },
    { label: "Paused", key: "paused", color: "#f9ca79" },
    { label: "Other", key: "", color: "#eab8d5" },
]

export function summarizeOceanLibrary(torrents: OceanTorrent[]) {
    const sectors = OCEAN_SECTORS.map(sector => ({ ...sector, count: 0 }))
    const bins = new Map<number, { count: number; progress: number; traffic: number }>()
    for (const torrent of torrents) {
        const sector = torrent.isStatusDownloading() ? 0 : torrent.isStatusSeeding() ? 1 : torrent.isStatusPaused() ? 2 : 3
        sectors[sector].count++
        if (!Number.isFinite(torrent.percent)) continue
        const progress = Math.min(100, Math.max(0, torrent.percent / 10))
        const bucket = Math.min(9, Math.floor(progress / 10))
        const key = sector * 10 + bucket
        const bin = bins.get(key) ?? { count: 0, progress: 0, traffic: 0 }
        bin.count++
        bin.progress += progress
        for (const rate of [torrent.downloadSpeed, torrent.uploadSpeed]) {
            if (Number.isFinite(rate) && rate > 0) bin.traffic += rate
        }
        bins.set(key, bin)
    }

    let peak = 0
    let bearing = 0
    const contacts = Array.from(bins, ([key, bin]) => {
        const sector = Math.floor(key / 10)
        const angle = sector * 90 + 23 + ((key % 10) * 29) % 44
        const radians = (angle - 90) * Math.PI / 180
        const progress = Math.round(bin.progress / bin.count)
        const distance = progress * .81
        if (bin.traffic > peak) {
            peak = bin.traffic
            bearing = angle
        }
        return {
            key, count: bin.count, progress, label: sectors[sector].label.toLowerCase(), color: sectors[sector].color,
            x: 100 + distance * Math.cos(radians), y: 100 + distance * Math.sin(radians),
            radius: Math.min(7, 2.8 + Math.log2(bin.count)),
        }
    })
    return { sectors, total: torrents.length, contacts, peak, bearing }
}

export function getOceanTrace(download: number[], upload: number[]) {
    const peak = Math.max(0, ...download, ...upload)
    const scale = Math.max(1, peak)
    const points = (samples: number[]) => samples.map((sample, index) => {
        const x = samples.length === 1 ? 100 : index * 100 / (samples.length - 1)
        return `${x.toFixed(2)},${(45 - sample / scale * 40).toFixed(2)}`
    }).join(" ")
    return { peak, samples: Math.max(download.length, upload.length), down: points(download), up: points(upload) }
}
