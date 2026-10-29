import chai from "chai"
import { $, browser } from "@wdio/globals"
import * as e2e from "../../e2e"
import { createTorrentFile } from "../../torrent"
import { configureSpec, createUniqueLabel, getTestFixture } from "../../framework/fixture"

const { assert } = chai
const fixture = getTestFixture()

describe("torrent column resizing", function () {
  configureSpec()

  it("lets a long torrent Name column auto-fit and shrink below 150 pixels", async function () {
    const filename = await createTorrentFile(fixture.tracker, {
      torrentName: createUniqueLabel("a-long-torrent-name-that-must-not-set-the-minimum-column-width"),
      files: { "test.bin": 1 },
    })
    const torrent: e2e.Torrent = await this.app.uploadTorrent({ filename })
    try {
      await torrent.waitForExist({ timeout: 20_000 })
      const header = $("#torrentTable thead th[data-col='decodedName']")
      await header.waitForDisplayed()
      const puppeteer = await browser.getPuppeteer()
      const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:"))
      if (!page) throw new Error("Electron renderer page not found")
      const target = await page.$("#torrentTable thead th[data-col='decodedName']")
      const handle = await page.$("#torrentTable thead th[data-col='decodedName'] .rz-handle")
      let bounds = await target?.boundingBox()
      let grip = await handle?.boundingBox()
      if (!bounds || !grip) throw new Error("Column resize handle not visible")
      const initialWidth = bounds.width
      await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2, { clickCount: 2 })
      bounds = await target!.boundingBox()
      grip = await handle!.boundingBox()
      if (!bounds || !grip) throw new Error("Column resize handle not visible after auto-fit")
      assert.isAbove(bounds.width, initialWidth + 20)
      // CSS zoom needs viewport coordinates; WebDriver's element rect uses
      // unscaled dimensions. Drag the actual visible handle with real input.
      const x = grip.x + grip.width / 2
      const y = grip.y + grip.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 110 - bounds.width, y, { steps: 10 })
      await page.mouse.up()
      const resized = await target!.boundingBox()
      assert.isBelow(resized!.width, 150)
      assert.isAbove(resized!.width, 40)
      const state = await page.$("#torrentTable th[data-col='statusMessage']")
      const stateHandle = await page.$("#torrentTable th[data-col='statusMessage'] .rz-handle")
      const stateGrip = await stateHandle?.boundingBox()
      if (!stateGrip) throw new Error("State resize handle not visible")
      await page.mouse.move(stateGrip.x + stateGrip.width / 2, stateGrip.y + stateGrip.height / 2)
      await page.mouse.down()
      await page.mouse.move(stateGrip.x - 500, stateGrip.y + stateGrip.height / 2, { steps: 10 })
      await page.mouse.up()
      assert.isAtLeast((await state!.boundingBox())!.width, 80, "State cannot collapse to one letter per line")
      const stateCell = $("#torrentTable tbody td[data-col='statusMessage']")
      assert.equal((await stateCell.getCSSProperty("white-space")).value, "nowrap")
      const overflow = await page.evaluate(() => {
        const content = document.querySelector('#page-torrents .main-content')!
        return content.scrollWidth - content.clientWidth
      })
      assert.isAtMost(overflow, 1, "readability floors preserve fit without horizontal scrolling")
      await browser.saveScreenshot("/tmp/torrent-state-width-fixed.png")
      const nameLayout = await page.evaluate(() => {
        const name = document.querySelector<HTMLElement>('#torrentTable tbody .torrent-name-content')!
        const row = name.parentElement!
        const box = name.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(name)
        return {
          rightGap: row.getBoundingClientRect().right - box.right,
          indents: Array.from(range.getClientRects()).map(line => Math.abs(line.left - box.left)),
        }
      })
      assert.isAtMost(nameLayout.rightGap, 2, "filename uses all width after the controls")
      assert.isTrue(nameLayout.indents.every(indent => indent <= 1), "wrapped filename lines start at the left edge")
      assert.equal(await torrent.isExisting(), true)
    } finally {
      if (await torrent.isExisting()) await torrent.delete()
    }
  })
})
