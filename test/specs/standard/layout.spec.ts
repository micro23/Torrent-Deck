import chai from "chai"
import { $, $$, browser } from "@wdio/globals"
import { eventually } from "../../e2e/eventually"
import { configureSpec } from "../../framework/fixture"
import { restartApplication } from "../../shared"
import { visibleBounds } from "../../e2e/geometry"

const assert: Chai.AssertStatic = chai.assert

describe("layout", function () {
  configureSpec()

  it("sidebar can be collapsed and restored after refresh", async function () {
    const initialTheme = await $("html").getAttribute("data-theme")
    const themePickerButton = $("[data-role='theme-picker']")
    await themePickerButton.waitForClickable()
    await themePickerButton.click()
    await $(".deck-theme-gallery").waitForDisplayed()
    assert.equal(await $("html").getAttribute("data-theme"), initialTheme)
    assert.isAbove((await $(".deck-theme-gallery").getSize()).width, 250)
    const darkhandTheme = $("button[aria-label='Choose Darkhand theme']")
    await darkhandTheme.scrollIntoView({ block: "center", inline: "nearest" })
    await darkhandTheme.waitForClickable()
    assert.isAtLeast((await darkhandTheme.getSize()).width, 100)
    await darkhandTheme.click()
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await this.app.setTorrentSidebarCollapsed(false)
    const toolbar = await visibleBounds(".deck-control-strip")
    const search = await visibleBounds(".deck-toolbar-search input")
    const toolbarCenter = toolbar.x + toolbar.width / 2
    const searchCenter = search.x + search.width / 2
    assert.closeTo(searchCenter, toolbarCenter, 2, "search is centered in the toolbar")
    const sidebar = $("torrent-sidebar")
    const sidebarBottom = (await sidebar.getLocation()).y + (await sidebar.getSize()).height
    const collapseButton = $("[data-role='torrent-sidebar-toggle']")
    const buttonBottom = (await collapseButton.getLocation()).y + (await collapseButton.getSize()).height
    assert.isAtLeast(sidebarBottom - buttonBottom, 12, "footer controls have bottom padding")
    const expandedWidth = (await $("torrent-sidebar").getSize()).width
    const expandedContentWidth = (await $("#page-torrents .main-panel").getSize()).width
    await this.app.setTorrentSidebarCollapsed(true)

    await eventually(async () => (await $("torrent-sidebar").getSize()).width)
      .satisfies("shrink the sidebar", (width) => width < expandedWidth - 50)
    await eventually(async () => (await $("#page-torrents .main-panel").getSize()).width)
      .satisfies("give the content more space", (width) => width > expandedContentWidth + 50)

    assert.isTrue(await this.app.isTorrentSidebarCollapsed())
    await $("torrent-sidebar .nav li[data-state='all']").waitForDisplayed()

    await restartApplication(this)
    await this.app.torrentsPageIsVisible()
    assert.isTrue(await this.app.isTorrentSidebarCollapsed())

    await this.app.setTorrentSidebarCollapsed(false)
    assert.isFalse(await this.app.isTorrentSidebarCollapsed())
    await eventually(async () => (await $("torrent-sidebar").getSize()).width)
      .equals(expandedWidth)
  })

  it("keeps the collapsed Terminal shelf controls inside its bounds", async function () {
    await this.app.openSettings()
    await this.app.settingsGotoTab("general")
    const terminalTheme = $("button[aria-label='Choose Terminal theme']")
    await terminalTheme.scrollIntoView({ block: "center", inline: "nearest" })
    await terminalTheme.waitForClickable()
    await terminalTheme.click()
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()
    await this.app.setTorrentSidebarCollapsed(true)
    await eventually(async () => (await $("torrent-sidebar").getSize()).width)
      .satisfies("use the compact rail", width => width < 75)
    const sidebar = $("torrent-sidebar")
    const left = (await sidebar.getLocation()).x
    const right = left + (await sidebar.getSize()).width
    const controls = await $$("torrent-sidebar .nav > li, torrent-sidebar .terminal-preferences, torrent-sidebar .torrent-sidebar-toggle")
    for (const control of controls) {
      const location = await control.getLocation()
      const size = await control.getSize()
      assert.isAtLeast(location.x, left - 1)
      assert.isAtMost(location.x + size.width, right + 1)
    }
    assert.isFalse(await $("torrent-sidebar .deck-sidebar-caption").isDisplayed())
    const rows = await $$("torrent-sidebar .nav > li")
    for (const row of rows) {
      const icon = row.$(".icon")
      const count = row.$(".torrent.sort.label")
      const iconRight = (await icon.getLocation()).x + (await icon.getSize()).width
      assert.isAtLeast((await count.getLocation()).x, iconRight)
    }
    await this.app.setTorrentSidebarCollapsed(false)
    await $("torrent-sidebar .deck-sidebar-caption").waitForDisplayed()
    await browser.keys("d")
    await eventually(async () => $("html").getAttribute("data-theme")).equals("darkhand")
  })

  it("can change layout columns", async function () {
    await this.app.openSettings()
    await this.app.settingsGotoTab("layout")

    const layoutColumns = await this.app.getLayoutColumns()
    const targetColumn = layoutColumns.find((column) => column.enabled && column.name !== "Torrent")
    assert.isOk(targetColumn, "expected at least one enabled column")

    await this.app.setLayoutColumnEnabled(targetColumn!.name, false)
    const updatedColumns = await this.app.getLayoutColumns()
    assert.isFalse(updatedColumns.find((column) => column.name === targetColumn!.name)!.enabled)

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await this.app.openSettings()
    await this.app.settingsGotoTab("layout")
    const persistedColumns = await this.app.getLayoutColumns()
    assert.isFalse(persistedColumns.find((column) => column.name === targetColumn!.name)!.enabled)
  })

  it("can enable compact listings", async function () {
    await this.app.openSettings()
    await this.app.settingsGotoTab("general")
    const initialState = await this.app.getGeneralToggleState("Compact Listings")
    await this.app.setGeneralToggle("Compact Listings", !initialState)
    assert.equal(await this.app.getGeneralToggleState("Compact Listings"), !initialState)

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await eventually(() => $("#torrentTable").getAttribute("class"))
      .satisfies(`compact state to be ${!initialState}`, (className) => (className || "").includes("compact") === !initialState)
  })
})
