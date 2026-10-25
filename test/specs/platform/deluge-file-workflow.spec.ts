import chai from "chai"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import parseTorrent from "parse-torrent"
import { $, browser } from "@wdio/globals"
import { Torrent } from "../../e2e"
import { waitForModalClose, waitForModalOpen } from "../../e2e/modal"
import { configureSpec, getTestFixture } from "../../framework/fixture"
import { eventually } from "../../e2e/eventually"

const assert: Chai.AssertStatic = chai.assert

describe("native Deluge file workflow", function () {
  configureSpec({ login: false })
  const torrents: Record<string, Record<string, unknown>> = {}
  let directory: string
  const trackerUrl = "https://tracker.example/announce"
  let trackerWrites = 0
  let failNextTrackerWrite = false
  // A local Deluge protocol fixture keeps native Windows/macOS checks independent
  // of Docker. Production Deluge code still performs every HTTP and IPC call.
  const server = http.createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const rpc = JSON.parse(Buffer.concat(chunks).toString())
      let result: unknown
      switch (rpc.method) {
        case "auth.login": result = true; break
        case "web.get_hosts": result = [["local", "127.0.0.1", 58846, "Connected"]]; break
        case "web.connect": result = ["core.add_torrent_magnet", "core.add_torrent_file"]; break
        case "web.get_host_status": result = ["local", "Connected", "2.2.0"]; break
        case "core.get_enabled_plugins": result = ["Label"]; break
        case "label.get_labels": result = []; break
        case "core.get_config_values": result = { download_location: directory }; break
        case "core.get_free_space": result = 1024 ** 4; break
        case "web.update_ui": result = { torrents, stats: {}, connected: true }; break
        case "core.add_torrent_file": {
          const parsed = parseTorrent(Buffer.from(rpc.params[1], "base64"))
          torrents[parsed.infoHash] = {
            name: parsed.name, total_wanted: "length" in parsed ? parsed.length : 1, total_done: 0, total_uploaded: 0,
            progress: 0, state: rpc.params[2].add_paused ? "Paused" : "Downloading",
            download_payload_rate: 1024, upload_payload_rate: 0, ratio: 0, eta: 60,
            num_peers: 1, total_peers: 1, num_seeds: 1, total_seeds: 1,
            queue: 0, time_added: Date.now() / 1000, save_path: directory,
            trackers: [{ url: trackerUrl, tier: 0 }],
          }
          result = parsed.infoHash
          break
        }
        case "core.remove_torrent": delete torrents[rpc.params[0]]; result = true; break
        case "web.get_torrent_status": result = torrents[rpc.params[0]]; break
        case "core.set_torrent_trackers":
          trackerWrites++
          if (failNextTrackerWrite) {
            failNextTrackerWrite = false
            throw new Error("Tracker update refused")
          }
          torrents[rpc.params[0]].trackers = rpc.params[1]
          result = null
          break
        default: throw new Error(`Unexpected Deluge RPC: ${rpc.method}`)
      }
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ id: rpc.id, result, error: null }))
    } catch (error) {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ result: null, error: { message: String(error) } }))
    }
  })

  before(async function () {
    await browser.electron.execute(electron => {
      const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith("/index.html"))
      if (!window) throw new Error("Electron renderer window not found")
      window.setBounds({ x: 0, y: 0, width: 1600, height: 900 })
    })
    const puppeteer = await browser.getPuppeteer()
    const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))
    if (!page) throw new Error("Electron renderer page not found")
    await page.setViewport({ width: 1600, height: 900 })
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "torrent-deck-native-"))
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Deluge fixture did not start")
    await this.app.login({ ...getTestFixture().client, host: "127.0.0.1", port: address.port })
    await this.app.torrentsPageIsVisible()
    // The torrent page can appear before the welcome overlay's exit animation
    // finishes. A real click waits until that overlay no longer intercepts input.
    await $("#page-torrents li[data-state='all']").waitForClickable()
    await $("#page-torrents li[data-state='all']").click()
  })

  after(async function () {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    if (directory) fs.rmSync(directory, { recursive: true, force: true })
  })

  for (const input of ["file picker", "menu", "file launch", "drop", "modifier drop"] as const) {
    it(`${input} adds a torrent without reloading and supports removal`, async function () {
      const name = `Native ${input} ü`
      const filename = path.join(directory, `${name}.TORRENT`)
      const bytes = Buffer.concat([
        Buffer.from(`d4:infod6:lengthi1e4:name${Buffer.byteLength(name)}:${name}12:piece lengthi16384e6:pieces20:`),
        Buffer.alloc(20, 0x5a), Buffer.from("ee"),
      ])
      fs.writeFileSync(filename, bytes)
      const torrent = new Torrent({ hash: parseTorrent(bytes).infoHash, app: this.app })
      const isDrop = input === "drop" || input === "modifier drop"
      try {
        if (input === "file picker" || input === "menu") {
          const dialog = await browser.electron.mock("dialog", "showOpenDialog")
          try {
            await dialog.mockResolvedValue({ canceled: false, filePaths: [filename] })
            if (input === "file picker") {
              await $("[data-role='add-torrent']").click()
            } else {
              const fileMenu = $("//button[contains(@class, 'title-bar-menu-trigger') and normalize-space(.)='File']")
              await fileMenu.click()
              await $("//button[contains(@class, 'title-bar-menu-item')]//*[normalize-space(.)='Add Torrent']/parent::button").click()
            }
            await this.app.uploadTorrentModalVisible()
          } finally {
            await dialog.mockRestore()
          }
        } else if (input === "file launch") {
          await browser.electron.execute((electron, filename) => {
            if (process.platform === "darwin") {
              electron.app.emit("open-file", { preventDefault() {} }, filename)
            } else {
              electron.app.emit("second-instance", {}, [process.execPath, filename], process.cwd(), {})
            }
          }, filename)
        } else {
          const puppeteer = await browser.getPuppeteer()
          const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))
          if (!page) throw new Error("Electron renderer page not found")
          // The table can extend horizontally beyond the viewport. Drop into
          // its visible scroll container rather than the off-screen table center.
          const target = await page.$("#page-torrents .main-content")
          const bounds = await target?.boundingBox()
          if (!bounds) throw new Error("Torrent table is not visible")
          const session = await page.createCDPSession()
          try {
            await page.evaluate(() => {
              (window as any).__nativeDrop = undefined
              document.addEventListener("drop", event => {
                const drop = event as DragEvent
                ;(window as any).__nativeDrop = {
                  target: (event.target as Element).outerHTML.slice(0, 200),
                  inDropZone: !!(event.target as Element).closest("[drag-and-drop]"),
                  files: Array.from(drop.dataTransfer?.files || []).map(file => file.name),
                }
              }, { capture: true, once: true })
            })
            for (const type of ["dragEnter", "dragOver", "drop"] as const) {
              await session.send("Input.dispatchDragEvent", {
                type, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
                modifiers: input === "modifier drop" ? (process.platform === "darwin" ? 1 : 2) : 0,
                data: { items: [], files: [filename], dragOperationsMask: 1 },
              })
            }
            console.info("Native drop diagnostic", JSON.stringify(await page.evaluate(() => ({
              drop: (window as any).__nativeDrop,
              viewport: { width: innerWidth, height: innerHeight },
              notifications: document.querySelector("#notifications")?.textContent,
            }))))
          } finally {
            await session.detach()
          }
        }
        const paused = input === "modifier drop"
        if (!isDrop || paused) {
          await this.app.uploadTorrentModalSubmit({ start: !paused })
          assert.isTrue(await torrent.isExisting(), "torrent must be visible when the dialog closes")
        }
        await torrent.waitForExist()
        await torrent.waitForState(paused ? "Paused" : "Downloading")
        assert.property(torrents, torrent.hash, "Deluge must receive the torrent")
        if (input === "file picker") {
          const dropdown = await torrent.openLabelsDropdown()
          await dropdown.$("[data-role='new-label']").click()
          const modal = $("#newLabelModal")
          await waitForModalOpen(modal)
          await modal.$("button.deny").click()
          await waitForModalClose(modal)
        }
        await torrent.delete()
        await torrent.waitForGone()
        assert.notProperty(torrents, torrent.hash, "Remove confirmation must reach Deluge")
      } finally {
        if (await torrent.isExisting()) await torrent.delete()
      }
    })
  }

  it("keeps a refused tracker removal open and allows retry", async function () {
    const name = "Native tracker retry"
    const filename = path.join(directory, `${name}.torrent`)
    fs.writeFileSync(filename, Buffer.concat([
      Buffer.from(`d4:infod6:lengthi1e4:name${Buffer.byteLength(name)}:${name}12:piece lengthi16384e6:pieces20:`),
      Buffer.alloc(20, 0x5a), Buffer.from("ee"),
    ]))
    const torrent = await this.app.uploadTorrent({ filename })
    await torrent.waitForExist()
    const panel = await torrent.openDetailsPanel()
    try {
      await torrent.openDetailsTab("trackers")
      const row = panel.$(`tr[data-tracker-url='${trackerUrl}']`)
      await row.waitForDisplayed()
      const remove = row.$("[data-role='torrent-tracker-remove']")
      await remove.scrollIntoView({ block: "center", inline: "center" })
      await remove.click()
      const modal = $("#torrent-tracker-remove-modal")
      await waitForModalOpen(modal)
      failNextTrackerWrite = true
      const confirm = modal.$("[data-role='torrent-tracker-remove-confirm']")
      await confirm.click()
      await eventually(() => modal.$("[role='alert']").getText()).contains("Tracker update refused")
      assert.isTrue(await modal.isDisplayed(), "server failure must keep the confirmation visible")
      assert.equal(trackerWrites, 1)
      assert.isTrue(await row.isExisting(), "failed removal must retain the tracker")
      await confirm.click()
      await waitForModalClose(modal)
      await eventually(() => row.isExisting()).equals(false)
      assert.equal(trackerWrites, 2, "retry must send one new request")
    } finally {
      await torrent.closeDetailsPanel()
      if (await torrent.isExisting()) await torrent.delete()
    }
  })
})
