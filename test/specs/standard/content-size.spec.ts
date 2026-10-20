import chai from "chai"
import { $, $$, browser } from "@wdio/globals"
import { configureSpec } from "../../framework/fixture"
import { eventually } from "../../e2e/eventually"
import { restartApplication } from "../../shared"
import { DECK_THEME_ORDER, DECK_THEME_TITLES } from "../../../src/shared/deck-themes"

const { assert } = chai

async function chooseSize(label: string) {
  const view = $("//button[contains(@class,'title-bar-menu-trigger') and normalize-space(.)='View']")
  if (await view.isDisplayed()) {
    await view.click()
    await $(`//button[contains(@class,'title-bar-menu-item')]//*[normalize-space(.)='${label}']/parent::button`).click()
  } else {
    // Terminal uses the OS menu instead of the in-window title bar.
    await browser.electron.execute((electron, label) => {
      const view = electron.Menu.getApplicationMenu()?.items.find(item => item.label === "View")
      const item = view?.submenu?.items.find(item => item.label === label)
      if (!item) throw new Error(`Native size menu item not found: ${label}`)
      item.click(item, electron.BrowserWindow.getFocusedWindow(), {} as Electron.KeyboardEvent)
    }, label)
  }
}

async function scale() {
  return Number((await $("#page-torrents .main-content").getCSSProperty("zoom")).value)
}

async function bounds(selector: string) {
  const puppeteer = await browser.getPuppeteer()
  const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:"))
  const box = await (await page?.$(selector))?.boundingBox()
  if (!box) throw new Error(`No bounds for ${selector}`)
  return box
}

async function topMenuHeight() {
  return await $(".title-bar-menu").isDisplayed() ? (await bounds(".title-bar-menu")).height : 0
}

describe("main content size", function () {
  configureSpec()

  before(async function () {
    await browser.electron.execute((electron) => {
      const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith("file:"))
      if (!window) throw new Error("Electron app window not found")
      window.setSize(1600, 900)
    })
  })

  it("uses the screenshot column order and concise headings by default", async function () {
    const headers = await $$("#torrentTable thead th")
    const names = await headers.map(header => header.getText())
    assert.deepEqual(names.map(name => name.trim().toLowerCase()), [
      "torrent", "state", "size", "progress", "↓ download", "↑ upload", "eta", "ratio", "seeds", "peers", "seed time", "uploaded",
    ])
    assert.equal(await scale(), .8)
  })

  it("scales content in saved ten-point steps without changing the top bar or sidebar", async function () {
    this.timeout(90_000)
    const sidebarWidth = (await bounds("torrent-sidebar")).width
    const menuHeight = await topMenuHeight()
    const heightAt80 = (await bounds("#torrentTable thead")).height
    try {
      await chooseSize("Increase Content Size (10%)")
      await eventually(scale).equals(.9)
      await chooseSize("Increase Content Size (10%)")
      await eventually(scale).equals(1)
      assert.closeTo((await bounds("#torrentTable thead")).height / heightAt80, 1.25, .06)
      assert.equal((await bounds("torrent-sidebar")).width, sidebarWidth)
      assert.equal(await topMenuHeight(), menuHeight)
      await restartApplication(this)
      await this.app.torrentsPageIsVisible()
      assert.equal(await scale(), 1)
      for (let i = 0; i < 6; i++) await chooseSize("Decrease Content Size (10%)")
      await eventually(scale).equals(.5)
      for (let i = 0; i < 9; i++) await chooseSize("Increase Content Size (10%)")
      await eventually(scale).equals(1.3)
    } finally {
      await chooseSize("Reset Content Size (80%)")
      await eventually(scale).equals(.8)
      await browser.saveScreenshot("/tmp/torrent-deck-content-80.png")
    }
  })

  for (const theme of DECK_THEME_ORDER) {
    it(`applies content sizing to the ${DECK_THEME_TITLES[theme]} theme`, async function () {
      // The sidebar stays unscaled, so WebDriver can click it reliably even
      // where its reported coordinates for zoomed toolbar buttons differ.
      const settings = $("#page-settings")
      if (!await settings.isDisplayed()) {
        const preferences = $(".terminal-preferences")
        await preferences.waitForClickable({ timeout: 20_000 })
        await preferences.click()
        await settings.waitForDisplayed({ timeout: 20_000 })
      }
      await this.app.settingsGotoTab("general")
      const choice = $(`button[aria-label='Choose ${DECK_THEME_TITLES[theme]} theme']`)
      await choice.scrollIntoView({ block: "center", inline: "nearest" })
      await choice.click()
      await this.app.settingsSave()
      await this.app.torrentsPageIsVisible()
      assert.equal(await $("html").getAttribute("data-theme"), theme)
      const rail = await bounds(".status-bar")
      const disk = await bounds(".status-bar .status-free-space")
      const sync = await bounds(".status-bar .status-sync")
      const ip = await bounds(".status-bar .status-ip")
      if (theme === "darkhand") {
        const sidebar = await bounds("torrent-sidebar")
        assert.isAtMost(sidebar.y + sidebar.height, rail.y, "Darkhand: sidebar stays above the full-width rail")
      }
      assert.isAtLeast(disk.x, rail.x, `${theme}: disk inside rail`)
      assert.isAbove(sync.x, disk.x, `${theme}: sync follows disk`)
      assert.isAbove(ip.x, sync.x, `${theme}: IP follows sync`)
      assert.isAtMost(ip.x + ip.width, rail.x + rail.width + 1, `${theme}: IP inside rail`)
      assert.isAtLeast(disk.y, rail.y, `${theme}: disk below rail top`)
      assert.isAtMost(disk.y + disk.height, rail.y + rail.height + 1, `${theme}: disk inside rail height`)

      assert.equal(await scale(), .8, theme)
      const sidebarWidth = (await bounds("torrent-sidebar")).width
      const menuHeight = await topMenuHeight()
      const height = (await bounds("#torrentTable thead")).height
      try {
        await chooseSize("Increase Content Size (10%)")
        await eventually(scale).equals(.9)
        assert.closeTo((await bounds("#torrentTable thead")).height / height, 1.125, .06, theme)
        assert.closeTo((await bounds("torrent-sidebar")).width, sidebarWidth, 1, theme)
        assert.equal(await topMenuHeight(), menuHeight, theme)
      } finally {
        await chooseSize("Reset Content Size (80%)")
        await eventually(scale).equals(.8)
      }
    })
  }
})
