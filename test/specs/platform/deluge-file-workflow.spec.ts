import chai from "chai"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import parseTorrent from "parse-torrent"
import { $, browser } from "@wdio/globals"
import { Torrent } from "../../e2e"
import { configureSpec, getTestFixture } from "../../framework/fixture"

const assert: Chai.AssertStatic = chai.assert

describe("native Deluge file workflow", function () {
  configureSpec({ login: false })
  const torrents: Record<string, Record<string, unknown>> = {}
  let directory: string
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
        case "core.get_enabled_plugins": result = []; break
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
          }
          result = parsed.infoHash
          break
        }
        case "core.remove_torrent": delete torrents[rpc.params[0]]; result = true; break
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
          const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:"))
          if (!page) throw new Error("Electron renderer page not found")
          const target = await page.$("#torrentTable")
          const bounds = await target?.boundingBox()
          if (!bounds) throw new Error("Torrent table is not visible")
          const session = await page.createCDPSession()
          try {
            for (const type of ["dragEnter", "dragOver", "drop"] as const) {
              await session.send("Input.dispatchDragEvent", {
                type, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
                modifiers: input === "modifier drop" ? (process.platform === "darwin" ? 1 : 2) : 0,
                data: { items: [], files: [filename], dragOperationsMask: 1 },
              })
            }
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
        await torrent.delete()
        await torrent.waitForGone()
        assert.notProperty(torrents, torrent.hash, "Remove confirmation must reach Deluge")
      } finally {
        if (await torrent.isExisting()) await torrent.delete()
      }
    })
  }
})
