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

  it("applies content sizing to every theme", async function () {
    this.timeout(360_000)
    for (const theme of DECK_THEME_ORDER) {
      await this.app.openSettings()
      await this.app.settingsGotoTab("general")
      const choice = $(`button[aria-label='Choose ${DECK_THEME_TITLES[theme]} theme']`)
      await choice.scrollIntoView({ block: "center", inline: "nearest" })
      await choice.click()
      await this.app.settingsSave()
      await this.app.torrentsPageIsVisible()
      assert.equal(await $("html").getAttribute("data-theme"), theme)
      assert.equal(await scale(), .8, theme)
      const sidebarWidth = (await bounds("torrent-sidebar")).width
      const menuHeight = await topMenuHeight()
      const height = (await bounds("#torrentTable thead")).height
      await chooseSize("Increase Content Size (10%)")
      await eventually(scale).equals(.9)
      assert.closeTo((await bounds("#torrentTable thead")).height / height, 1.125, .06, theme)
      assert.equal((await bounds("torrent-sidebar")).width, sidebarWidth, theme)
      assert.equal(await topMenuHeight(), menuHeight, theme)
      await chooseSize("Reset Content Size (80%)")
      await eventually(scale).equals(.8)
    }
  })
})
