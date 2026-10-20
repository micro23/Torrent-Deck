import chai from "chai"
import { $, $$, browser } from "@wdio/globals"
import { configureSpec } from "../../framework/fixture"
import { visibleBounds } from "../../e2e/geometry"

const assert: Chai.AssertStatic = chai.assert

describe("WebUI dashboard alignment", function () {
  configureSpec()

  for (const [width, height] of [[1600, 900], [1280, 800], [1000, 760]]) {
    it(`keeps the overview and history above the footer at ${width}x${height}`, async function () {
      await browser.electron.execute((electron, width, height) => {
        const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith("file:"))
        if (!window) throw new Error("App window not found")
        window.setSize(width, height)
      }, width, height)
      await $(".dh-overview").waitForDisplayed()
      const rail = await visibleBounds(".status-bar")
      const overview = await visibleBounds(".dh-overview")
      const note = await visibleBounds(".dh-history-note")
      assert.isAtMost(overview.y + overview.height, rail.y, "statistics stay above the fixed status rail")
      assert.isAtMost(note.y + note.height, rail.y, "chart note is not clipped by the rail")
      const table = await visibleBounds(".main-content")
      assert.isBelow(table.height, 250, "a short library does not stretch into a tall empty table")
    })
  }

  it("uses the WebUI outline symbols and three clock labels", async function () {
    assert.equal(await $$(".dh-stat > i svg").length, 6)
    const labels = await $$(".dh-axis > span")
    assert.equal(await labels.length, 3)
    for (const label of labels) {
      const text = await label.getText()
      assert.match(text, /\d.*\d/)
      assert.notMatch(text, /ago|seconds|minutes/i)
    }
    const caption = await $(".dh-stat:nth-child(3) small").getText()
    assert.match(caption, /^\d+ ↓ · \d+ ↑$/)
  })
})
