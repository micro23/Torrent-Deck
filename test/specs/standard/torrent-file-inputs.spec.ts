import fs from "node:fs"
import parseTorrent from "parse-torrent"
import { browser, $ } from "@wdio/globals"
import * as e2e from "../../e2e"
import { eventually } from "../../e2e/eventually"
import { configureSpec, createUniqueLabel, getTestFixture } from "../../framework/fixture"
import { createTorrentFile } from "../../torrent"

const fixture = getTestFixture()

describe("torrent file entry points", function () {
  configureSpec()

  for (const input of ["file picker", "drag and drop"] as const) {
    for (const prompt of [false, true]) {
      it(`${input} ${prompt ? "offers start options and adds paused" : "adds and starts a torrent"}`, async function () {
        this.timeout(90_000)
        const filename = await createTorrentFile(fixture.tracker, {
          torrentName: createUniqueLabel("file-input"),
          fileSize: 100000,
          downloadSpeed: 1,
          uploadSpeed: 1,
        })
        const metadata = parseTorrent(fs.readFileSync(filename))
        const torrent = new e2e.Torrent({ hash: metadata.infoHash, app: this.app })
        const secondFilename = input === "drag and drop" && prompt
          ? await createTorrentFile(fixture.tracker, { torrentName: createUniqueLabel("batch-input"), fileSize: 1 })
          : undefined
        const secondTorrent = secondFilename
          ? new e2e.Torrent({ hash: parseTorrent(fs.readFileSync(secondFilename)).infoHash, app: this.app })
          : undefined

        await this.app.openSettings()
        await this.app.settingsGotoTab("general")
        await this.app.setGeneralToggle("Always prompt for upload options", prompt)
        await this.app.settingsSave()
        await this.app.torrentsPageIsVisible()
        await $("#page-torrents li[data-state='all']").click()

        try {
          if (input === "file picker") {
            // Only replace the OS dialog response; click the real Add button and
            // exercise file reading, IPC, and the renderer's upload handler.
            const dialog = await browser.electron.mock("dialog", "showOpenDialog")
            try {
              await dialog.mockResolvedValue({ canceled: false, filePaths: [filename] })
              await $("[data-role='add-torrent']").click()
              if (prompt) await this.app.uploadTorrentModalVisible()
              else await torrent.waitForExist({ timeout: 20_000 })
            } finally {
              await dialog.mockRestore()
            }
          } else {
            // Chromium supplies real disk-backed File objects, including the
            // native path that Electron's webUtils resolves through preload.
            const puppeteer = await browser.getPuppeteer()
            const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:"))
            if (!page) throw new Error("Electron renderer page not found")
            const session = await page.createCDPSession()
            try {
              const target = await page.$("[drag-and-drop]")
              const bounds = await target?.boundingBox()
              if (!bounds) throw new Error("Drop target not visible")
              const data = { items: [], files: secondFilename ? [filename, secondFilename] : [filename], dragOperationsMask: 1 }
              for (const type of ["dragEnter", "dragOver", "drop"] as const) {
                await session.send("Input.dispatchDragEvent", {
                  type, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, data,
                })
              }
            } finally {
              await session.detach()
            }
          }

          if (prompt) {
            await this.app.uploadTorrentModalVisible()
            if (secondTorrent) {
              await eventually(() => this.app.uploadTorrentModalPendingCountLabel()).contains("2 torrents remaining")
              await this.app.uploadTorrentModalSubmit({ start: false, waitForClose: false })
              await eventually(() => this.app.uploadTorrentModalPendingCountLabel()).contains("1 torrent remaining")
            }
            await this.app.uploadTorrentModalSubmit({ start: false })
          }
          await torrent.waitForExist({ timeout: 20_000 })
          if (prompt) await torrent.waitForState(fixture.client.stopLabel, { timeout: 20_000 })
          else await torrent.waitForDownloading({ timeout: 20_000 })
          if (secondTorrent) {
            await secondTorrent.waitForExist({ timeout: 20_000 })
            await secondTorrent.waitForState(fixture.client.stopLabel, { timeout: 20_000 })
          }
        } finally {
          await $("#page-torrents li[data-state='all']").click()
          if (await torrent.isExisting()) await torrent.delete()
          if (secondTorrent && await secondTorrent.isExisting()) await secondTorrent.delete()
        }
      })
    }
  }
})
