import fs from "node:fs"
import { $, browser } from "@wdio/globals"
import parseTorrent from "parse-torrent"
import * as e2e from "../../e2e"
import { eventually } from "../../e2e/eventually"
import { dragVisibleElement, visibleBounds } from "../../e2e/geometry"
import { configureSpec, formatBytes, getTestFixture, requireFeature } from "../../framework/fixture"
import { createTorrentFile } from "../../torrent"
import { DECK_THEME_ORDER, DECK_THEME_TITLES } from "../../../src/shared/deck-themes"

const tracker = getTestFixture().tracker
const trackerUrls = [
  "http://tracker-one.test:6969/announce",
  "http://tracker-two.test:6969/announce",
  "http://tracker-three.test:6969/announce",
]
describe("torrent details", function () {
  configureSpec()
  requireFeature(({ features }) => features.torrentDetails === true)

  let torrent: e2e.Torrent
  let torrentMetadata: parseTorrent.Instance

  before(async function () {
    const filename = await createTorrentFile(tracker, {
      files: {
        "documents/readme.txt": 100_000,
        "documents/guides/setup.txt": 100_000,
        "media/preview.jpg": 100_000,
      },
      downloadSpeed: 1,
      uploadSpeed: 1,
      trackerUrls,
    })
    torrentMetadata = parseTorrent(fs.readFileSync(filename)) as parseTorrent.Instance
    torrent = await this.app.uploadTorrent({ filename })
    await torrent.waitForExist()
  })

  after(async function () {
    if (torrent && await torrent.isExisting()) {
      await torrent.delete()
    }
  })

  it("shows the connected torrent peer in the peers tab", async function () {
    this.timeout(60 * 1000)

    if (getTestFixture().client.features.torrentPeers !== true) {
      this.skip()
    }

    const filename = await createTorrentFile(tracker, {
      fileSize: 100_000,
      downloadSpeed: 1,
      uploadSpeed: 1,
      seedDelay: 15,
    })
    const peerTorrent = await this.app.uploadTorrent({ filename })
    await peerTorrent.waitForExist()

    let detailsPanelOpen = false
    try {
      const panel = await peerTorrent.openDetailsPanel()
      detailsPanelOpen = true
      await peerTorrent.openDetailsTab("peers")

      const peersTab = panel.$("[data-role='torrent-details-peers']")
      await eventually(async () => (await peersTab.$$("tbody td[data-col='ip']")).length).satisfies(
        "contain a connected peer row",
        (peerCount) => peerCount > 0,
        { timeout: 30_000 },
      )
    } finally {
      if (detailsPanelOpen) {
        await peerTorrent.closeDetailsPanel()
      }
      if (await peerTorrent.isExisting()) {
        await peerTorrent.delete()
      }
    }
  })

  it("hides unsupported peer and tracker tabs", async function () {
    if (getTestFixture().client.features.torrentPeers === true || getTestFixture().client.features.torrentTrackers === true) {
      return this.skip()
    }

    const panel = await torrent.openDetailsPanel()
    try {
      const peersTabExists = await panel.$("[data-role='torrent-details-tab-peers']").isExisting()
      const trackersTabExists = await panel.$("[data-role='torrent-details-tab-trackers']").isExisting()
      peersTabExists.should.equal(false)
      trackersTabExists.should.equal(false)
    } finally {
      await torrent.closeDetailsPanel()
    }
  })

  it("shows expected torrent information in the info tab", async function () {
    this.timeout(60 * 1000)

    const panel = await torrent.openDetailsPanel()
    const infoTab = panel.$("[data-role='torrent-details-info']")

    await eventually(() => infoTab.getText()).contains(torrentMetadata.infoHash, { timeout: 30_000 })

    const infoText = await infoTab.getText()
    infoText.should.contain(torrentMetadata.name || "")
    infoText.should.contain(torrentMetadata.infoHash)
    infoText.should.contain(formatBytes(torrentMetadata.length || 0))

    const hashValue = infoTab.$("[data-field-id='hash'] .torrent-details-field-copy")
    await hashValue.click()
    const clipboardText = await browser.electron.execute((electron) => electron.clipboard.readText())
    clipboardText.should.equal(torrentMetadata.infoHash)

    await torrent.closeDetailsPanel()
  })

  it("keeps all details tabs populated when switching between bottom and right", async function () {
    this.timeout(90_000)
    const features = getTestFixture().client.features
    if (features.torrentPeers !== true || features.torrentTrackers !== true) return this.skip()
    await browser.electron.execute((electron) => {
      const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith("file:"))
      if (!window) throw new Error("App window not found")
      window.setSize(1600, 1000)
    })
    const right = $(".dh-switches [aria-label='Details placement'] button:first-child")
    const bottom = $(".dh-switches [aria-label='Details placement'] button:last-child")
    await bottom.click()
    const panel = await torrent.openDetailsPanel()
    try {
      await eventually(() => panel.$("[data-role='torrent-details-info']").getText()).contains(torrentMetadata.infoHash)
      await right.click()
      await eventually(() => right.getAttribute("aria-pressed")).equals("true")
      // Angular applies ng-class through its animation queue after aria-pressed.
      // Wait for the visible layout, including on slower CI renderers.
      await eventually(async () => {
        const side = await visibleBounds(".torrent-details-panel")
        const library = await visibleBounds("#page-torrents .main-content")
        return side.x - (library.x + library.width)
      }).satisfies("keep details beside the library", (gap) => gap >= -1)
      const body = await visibleBounds(".torrent-details-panel-body")
      body.height.should.be.above(200, "right details body has usable height")
      await eventually(() => panel.$("[data-role='torrent-details-info']").getText()).contains(torrentMetadata.infoHash)

      await torrent.openDetailsTab("files")
      await eventually(() => panel.$("[data-role='torrent-details-files']").getText()).contains("readme.txt")
      ;(await visibleBounds("#torrentDetailsFilesTable thead th[data-col='name']")).width.should.be.above(150)
      ;(await visibleBounds("#torrentDetailsFilesTable")).width.should.be.above(body.width + 100)
      await torrent.openDetailsTab("peers")
      await panel.$("[data-role='torrent-details-peers']").waitForDisplayed()
      ;(await visibleBounds("[data-role='torrent-details-peers']")).height.should.be.above(100)
      await panel.$("#torrentDetailsPeersTable thead th[data-col='ip']").waitForDisplayed({ timeout: 30_000 })
      ;(await visibleBounds("#torrentDetailsPeersTable thead th[data-col='ip']")).width.should.be.above(100)
      ;(await visibleBounds("#torrentDetailsPeersTable")).width.should.be.above(body.width + 100)
      await torrent.openDetailsTab("trackers")
      await eventually(() => panel.$("[data-role='torrent-details-trackers']").getText()).satisfies(
        "show every tracker in the right panel", text => trackerUrls.every(url => text.includes(url)),
      )
      const urlHeader = "#torrentDetailsTrackersTable thead th[data-col='url']"
      ;(await visibleBounds(urlHeader)).width.should.be.above(250, "tracker URL retains a readable width")
      ;(await visibleBounds("#torrentDetailsTrackersTable")).width.should.be.above(body.width + 100)
      const close = await visibleBounds("[data-role='torrent-details-close']")
      const side = await visibleBounds(".torrent-details-panel")
      ;(close.x + close.width).should.be.at.most(side.x + side.width + 1, "close control fits in the sidebar")
      // Focus the scroll region organically and move through the wide table.
      // Reading DOM text alone would pass even when every URL was ellipsized.
      const scroller = panel.$(".torrent-details-trackers-content")
      const start = (await visibleBounds(urlHeader)).x
      await browser.saveScreenshot("/tmp/torrent-deck-readable-right-details.png")
      await scroller.click({ x: 20, y: 120 })
      await browser.keys(["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"])
      await eventually(async () => (await visibleBounds(urlHeader)).x)
        .satisfies("scroll horizontally to additional tracker columns", x => x < start - 20)
      await browser.keys(Array.from({ length: 80 }, () => "ArrowRight"))
      await eventually(async () => {
        const actions = await visibleBounds("#torrentDetailsTrackersTable tbody .torrent-details-tracker-actions")
        return actions.x + actions.width
      }).satisfies("reach tracker actions by scrolling", right => right <= side.x + side.width + 1)
      await browser.saveScreenshot("/tmp/torrent-deck-details-scrolled.png")
      await bottom.click()
      await eventually(() => bottom.getAttribute("aria-pressed")).equals("true")
      ;(await visibleBounds(".torrent-details-panel-body")).height.should.be.above(100)
      await eventually(() => panel.$("[data-role='torrent-details-trackers']").getText()).contains(trackerUrls[0])
    } finally {
      await bottom.click()
      await eventually(async () => {
        const details = await visibleBounds(".torrent-details-panel")
        const library = await visibleBounds("#page-torrents .main-content")
        return details.x - library.x
      }).satisfies("finish returning details to the bottom", gap => Math.abs(gap) < 2)
      await torrent.closeDetailsPanel()
    }
  })

  // Separate cases give each theme its own deadline on slower CI renderers.
  for (const theme of DECK_THEME_ORDER) {
    it(`preserves readable tracker columns in ${DECK_THEME_TITLES[theme]}`, async function () {
      this.timeout(90_000)
      if (getTestFixture().client.features.torrentTrackers !== true) return this.skip()
      const chooseTheme = async (choiceTheme: typeof DECK_THEME_ORDER[number]) => {
        await this.app.openSettings()
        await this.app.settingsGotoTab("general")
        const choice = $(`button[aria-label='Choose ${DECK_THEME_TITLES[choiceTheme]} theme']`)
        await choice.scrollIntoView({ block: "center", inline: "nearest" })
        await choice.click()
        await this.app.settingsSave()
        await this.app.torrentsPageIsVisible()
      }
      await chooseTheme(theme)
      const panel = await torrent.openDetailsPanel()
      try {
        await torrent.openDetailsTab("trackers")
        await eventually(() => panel.$("[data-role='torrent-details-trackers']").getText()).contains(trackerUrls[0])
        ;(await visibleBounds("#torrentDetailsTrackersTable thead th[data-col='url']")).width
          .should.be.above(250, `${theme}: readable URL column`)
        ;(await visibleBounds("#torrentDetailsTrackersTable thead th[data-col='status']")).width
          .should.be.above(80, `${theme}: readable status column`)
      } finally {
        await torrent.closeDetailsPanel()
        if (theme === DECK_THEME_ORDER[DECK_THEME_ORDER.length - 1]) await chooseTheme("darkhand")
      }
    })
  }

  it("shows expected torrent file information in the files tab", async function () {
    this.timeout(60 * 1000)

    const panel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("files")

    const filesTab = panel.$("[data-role='torrent-details-files']")
    const expectedFile = torrentMetadata.files?.[0]
    const expectedPath = expectedFile?.path || ""
    const torrentRoot = `${torrentMetadata.name || ""}/`
    const expectedRelativePath = expectedPath.startsWith(torrentRoot)
      ? expectedPath.slice(torrentRoot.length)
      : expectedPath
    const expectedPaths = new Set([expectedPath, expectedRelativePath].filter(Boolean))

    await eventually(() => filesTab.getText()).satisfies(
      `contain a client-normalized path for ${expectedPath}`,
      (text) => Array.from(expectedPaths).some((path) => text.includes(path)),
      { timeout: 30_000 },
    )

    const filesText = await filesTab.getText()
    Array.from(expectedPaths).some((path) => filesText.includes(path)).should.equal(true)
    filesText.should.contain(formatBytes(expectedFile?.length || 0))

    const progressBar = filesTab.$(".torrent-details-file-progress .bar")
    await progressBar.waitForExist({ timeout: 10_000 })

    const firstHeaderCheckbox = filesTab.$("thead th:first-child input[type='checkbox']")
    await firstHeaderCheckbox.waitForExist({ timeout: 10_000 })

    const folderRow = filesTab.$("tbody tr.torrent-details-folder-row")
    await folderRow.waitForDisplayed({ timeout: 10_000 })
    const visibleRowsBeforeCollapse = await filesTab.$$("tbody tr")
    const rowCountBeforeCollapse = await visibleRowsBeforeCollapse.length

    await folderRow.$(".torrent-details-folder-toggle").click()
    await eventually(async () => (await filesTab.$$("tbody tr")).length)
      .satisfies("decrease after collapsing a folder", (count) => count < rowCountBeforeCollapse)

    await torrent.closeDetailsPanel()
  })

  it("shows every torrent tracker in the trackers tab", async function () {
    this.timeout(60 * 1000)

    if (getTestFixture().client.features.torrentTrackers !== true) {
      return this.skip()
    }

    const panel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("trackers")

    const trackersTab = panel.$("[data-role='torrent-details-trackers']")
    await eventually(() => trackersTab.getText()).satisfies(
      "contain every configured tracker",
      (text) => trackerUrls.every((url) => text.includes(url)),
      { timeout: 30_000 },
    )

    const trackerRows = await trackersTab.$$("tbody tr[data-tracker-url]")
    const displayedUrls = await trackerRows.map((row) => row.getAttribute("data-tracker-url"))
    trackerUrls.forEach((url) => displayedUrls.should.contain(url))

    const trackersTable = trackersTab.$("[data-role='torrent-details-trackers-table']")
    const urlHeader = trackersTable.$("thead th:first-child")
    await urlHeader.click()
    const expectedOrder = [...displayedUrls].sort().reverse().join("\n")
    await eventually(async () => {
      const sortedRows = await trackersTable.$$("tbody tr[data-tracker-url]")
      return (await sortedRows.map((row) => row.getAttribute("data-tracker-url"))).join("\n")
    }).satisfies("sort tracker URLs descending after the header click", (order) => order === expectedOrder)

    const handle = urlHeader.$(".rz-handle")
    await handle.waitForDisplayed({ timeout: 10_000 })
    const initialWidth = (await urlHeader.getSize()).width
    await dragVisibleElement("[data-role='torrent-details-trackers-table'] thead th:first-child .rz-handle", 40)
    await eventually(async () => (await urlHeader.getSize()).width)
      .satisfies(`change by at least 10 from ${initialWidth}`, (nextWidth) => Math.abs(nextWidth - initialWidth) >= 10)

    const resizedWidth = (await urlHeader.getSize()).width

    await torrent.closeDetailsPanel()

    const reopenedPanel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("trackers")

    const reopenedTrackersTable = reopenedPanel.$("[data-role='torrent-details-trackers-table']")
    await reopenedTrackersTable.waitForDisplayed({ timeout: 30_000 })
    const reopenedWidth = (await reopenedTrackersTable.$("thead th:first-child").getSize()).width
    reopenedWidth.should.be.closeTo(resizedWidth, 1)

    await torrent.closeDetailsPanel()
  })

  it("retains the resized tracker actions column", async function () {
    this.timeout(60 * 1000)

    if (getTestFixture().client.features.torrentTrackerManagement !== true) {
      return this.skip()
    }

    const panel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("trackers")

    const trackersTable = panel.$("[data-role='torrent-details-trackers-table']")
    const actionsHeader = trackersTable.$("thead th.torrent-details-tracker-actions")
    await actionsHeader.scrollIntoView({ block: "center", inline: "center" })
    const handle = actionsHeader.$(".rz-handle")
    await handle.waitForDisplayed({ timeout: 10_000 })

    const initialWidth = (await actionsHeader.getSize()).width
    await dragVisibleElement("[data-role='torrent-details-trackers-table'] thead th.torrent-details-tracker-actions .rz-handle", -40)
    await eventually(async () => (await actionsHeader.getSize()).width)
      .satisfies(`change by at least 10 from ${initialWidth}`, (nextWidth) => Math.abs(nextWidth - initialWidth) >= 10)

    const resizedWidth = (await actionsHeader.getSize()).width
    await torrent.closeDetailsPanel()

    const reopenedPanel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("trackers")

    const reopenedActionsHeader = reopenedPanel.$("[data-role='torrent-details-trackers-table'] thead th.torrent-details-tracker-actions")
    await reopenedActionsHeader.waitForDisplayed({ timeout: 30_000 })
    const reopenedWidth = (await reopenedActionsHeader.getSize()).width
    reopenedWidth.should.be.closeTo(resizedWidth, 1)

    await torrent.closeDetailsPanel()
  })

  it("can resize columns in the files tab", async function () {
    this.timeout(60 * 1000)

    const panel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("files")

    const filesTable = panel.$("[data-role='torrent-details-files-table']")
    await filesTable.waitForDisplayed({ timeout: 30_000 })

    await eventually(async () => (await filesTable.$$("thead th")).length)
      .satisfies("be greater than 1", (count) => count > 1, { timeout: 30_000 })

    const headers = await filesTable.$$("thead th")
    const selectionHeader = headers[0]
    const selectionWidth = (await selectionHeader.getSize()).width
    selectionWidth.should.be.at.most(40)
    const selectionHandleDisplayed = await selectionHeader.$(".rz-handle").isDisplayed()
    const selectionSortIconExists = await selectionHeader.$(".sorting.icon").isExisting()
    selectionHandleDisplayed.should.equal(false)
    selectionSortIconExists.should.equal(false)

    const selectionCell = filesTable.$("tbody td[data-col='wanted']")
    const selectionCheckbox = selectionCell.$(".torrent-details-file-checkbox")
    const cellLocation = await selectionCell.getLocation()
    const cellSize = await selectionCell.getSize()
    const checkboxLocation = await selectionCheckbox.getLocation()
    const checkboxSize = await selectionCheckbox.getSize()
    checkboxLocation.x.should.be.at.least(cellLocation.x)
    checkboxLocation.y.should.be.at.least(cellLocation.y)
    const checkboxRight = checkboxLocation.x + checkboxSize.width
    const checkboxBottom = checkboxLocation.y + checkboxSize.height
    checkboxRight.should.be.at.most(cellLocation.x + cellSize.width)
    checkboxBottom.should.be.at.most(cellLocation.y + cellSize.height)

    const firstResizableHeader = headers[1]
    const controlledHeader = firstResizableHeader
    const handle = firstResizableHeader.$(".rz-handle")
    await handle.waitForDisplayed({ timeout: 10_000 })

    const initialWidth = (await controlledHeader.getSize()).width
    await dragVisibleElement("[data-role='torrent-details-files-table'] thead th:nth-child(2) .rz-handle", 40)

    await eventually(async () => (await controlledHeader.getSize()).width)
      .satisfies(`change by at least 10 from ${initialWidth}`, (nextWidth) => Math.abs(nextWidth - initialWidth) >= 10)

    const resizedWidth = (await controlledHeader.getSize()).width

    await torrent.closeDetailsPanel()

    const reopenedPanel = await torrent.openDetailsPanel()
    await torrent.openDetailsTab("files")

    const reopenedFilesTable = reopenedPanel.$("[data-role='torrent-details-files-table']")
    await reopenedFilesTable.waitForDisplayed({ timeout: 30_000 })
    const reopenedHeaders = await reopenedFilesTable.$$("thead th")
    const reopenedWidth = (await reopenedHeaders[1].getSize()).width
    reopenedWidth.should.be.closeTo(resizedWidth, 1)

    await torrent.closeDetailsPanel()
  })
})
