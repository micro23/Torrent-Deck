import chai from "chai"
import { $, browser } from "@wdio/globals"
import { visibleBounds } from "../../e2e/geometry"
import * as e2e from "../../e2e"
import { eventually } from "../../e2e/eventually"
import { configureSpec, getTestFixture } from "../../framework/fixture"
import { restartApplication } from "../../shared"
import { createSlowTorrentFile } from "../../torrent"

const assert: Chai.AssertStatic = chai.assert
const tracker = getTestFixture().tracker
describe("settings", function () {
  configureSpec()

  before(async function () {
    await restartApplication(this)
    await this.app.torrentsPageIsVisible()
  })

  beforeEach(async function () {
    this.timeout(20 * 1000)
    await this.app.openSettings()
  })

  it("settings page is visible", async function () {
    await this.app.settingsPageIsVisible()
  })

  it("keeps settings pages and save controls reachable after resizing", async function () {
    this.timeout(90_000)
    const resize = async (width: number, height: number) => {
      const size = await browser.electron.execute((electron, width, height) => {
        const window = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith("/index.html"))
        if (!window) throw new Error("App window not found")
        window.setSize(width, height)
        return window.getContentBounds()
      }, width, height)
      await eventually(async () => (await visibleBounds(".app-content")).width).equals(size.width)
    }
    try {
      for (const [width, height] of [[1280, 900], [900, 700], [640, 600]]) {
        await resize(width, height)
        for (const tab of ["connection", "layout", "general"]) {
          await this.app.settingsGotoTab(tab)
          const page = await visibleBounds("#page-settings")
          const viewport = await visibleBounds(".app-content")
          assert.isAtMost(page.y + page.height, viewport.y + viewport.height + 1, "settings fit below the native title bar")
          const save = await visibleBounds("#page-settings .actions.footer .positive")
          const cancel = await visibleBounds("#page-settings .actions.footer .deny")
          assert.isAtMost(save.x + save.width, page.x + page.width, `${tab}: save inside viewport`)
          assert.isAtMost(save.y + save.height, page.y + page.height, `${tab}: save above bottom edge`)
          assert.isAtLeast(cancel.x, page.x, `${tab}: cancel inside viewport`)
          await $("#page-settings .actions.footer .positive").waitForEnabled()
        }
      }
      await browser.saveScreenshot("/tmp/torrent-deck-settings-compact.png")
    } finally {
      await resize(1600, 1000)
    }
  })

  it("general settings tab is shown by default", async function () {
    const generalTab = $("#page-settings-general")
    await generalTab.waitForDisplayed()
  })

  it("can navigate to the connection tab", async function () {
    await this.app.settingsGotoTab("connection")
    const connTab = $("#page-settings-connection")
    await connTab.waitForDisplayed()
  })

  it("can navigate to the layout tab", async function () {
    await this.app.settingsGotoTab("layout")
    const layoutTab = $("#page-settings-layout")
    await layoutTab.waitForDisplayed()
  })

  it("can navigate to the servers tab", async function () {
    await this.app.settingsGotoTab("servers")
    const serversTab = $("#page-settings-servers")
    await serversTab.waitForDisplayed()
  })

  it("can navigate to the advanced tab", async function () {
    await this.app.settingsGotoTab("advanced")
    const advancedTab = $("#page-settings-advanced")
    await advancedTab.waitForDisplayed()
  })

  it("can navigate to the about tab", async function () {
    await this.app.settingsGotoTab("about")
    const aboutTab = $("#page-settings-about")
    await aboutTab.waitForDisplayed()
  })

  it("servers tab shows the connected server", async function () {
    await this.app.settingsGotoTab("servers")
    const serverCount = await this.app.getSettingsServerCount()
    assert.isAtLeast(serverCount, 1, "at least one server should be listed")
  })

  it("can rename a server", async function () {
    await this.app.settingsGotoTab("servers")

    const originalNames = await this.app.getSettingsServerNames()
    assert.isAtLeast(originalNames.length, 1, "at least one server should be listed")

    const nextName = `Renamed ${Date.now()}`
    await this.app.renameSettingsServer(0, nextName)
    assert.equal(await this.app.getRenameSettingsServerValue(0), nextName)

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()
    assert.equal(await this.app.getStoredServerName(0), nextName)
    assert.equal(await this.app.getTitleBarServerName(), nextName)

    await this.app.openSettings()
    await this.app.settingsGotoTab("servers")
    assert.equal(await this.app.getStoredServerName(0), nextName)
  })

  it("can toggle background tray mode", async function () {
    await this.app.settingsGotoTab("general")
    const initialState = await this.app.getGeneralToggleState("Run in Background")
    const nextState = !initialState

    await this.app.setGeneralToggle("Run in Background", nextState)
    assert.equal(await this.app.getGeneralToggleState("Run in Background"), nextState)

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await this.app.openSettings()
    await this.app.settingsGotoTab("general")
    assert.equal(await this.app.getGeneralToggleState("Run in Background"), nextState)

    await this.app.setGeneralToggle("Run in Background", initialState)
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()
  })

  it("can enable always ask for upload options", async function () {
    const torrentFile = await createSlowTorrentFile(tracker)
    let torrent: e2e.Torrent | undefined

    await this.app.settingsGotoTab("general")
    const initialState = await this.app.getGeneralToggleState("Always prompt for upload options")
    await this.app.setGeneralToggle("Always prompt for upload options", true)
    assert.isTrue(await this.app.getGeneralToggleState("Always prompt for upload options"))

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    try {
      torrent = await this.app.uploadTorrent({ filename: torrentFile })
      await this.app.uploadTorrentModalVisible()
      await this.app.uploadTorrentModalSubmit()
      await torrent.waitForExist({ timeout: 30 * 1000 })
    } finally {
      if (torrent && await torrent.isExisting()) {
        await torrent.delete()
      }
    }

    if (!initialState) {
      await this.app.openSettings()
      await this.app.settingsGotoTab("general")
      await this.app.setGeneralToggle("Always prompt for upload options", false)
      await this.app.settingsSave()
      await this.app.torrentsPageIsVisible()
    }
  })

  it("can change the theme", async function () {
    await this.app.settingsGotoTab("general")
    const initialTheme = await this.app.getGeneralDropdownValue("Theme")
    const initialThemeHref = await this.app.getAppliedThemeHref()
    const availableThemes = this.app.getThemeOptions()
    assert.includeMembers(availableThemes, ["System", "Paper", "Midnight", "Darkhand", "Terminal"])
    assert.include(availableThemes, initialTheme, `expected a supported theme, got: ${initialTheme}`)
    const nextTheme = (initialThemeHref || "").includes("/dark.css") ? "Paper" : "Midnight"

    await this.app.selectGeneralDropdownValue("Theme", nextTheme)
    assert.equal(await this.app.getGeneralDropdownValue("Theme"), nextTheme)

    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await eventually(() => this.app.getAppliedThemeHref())
      .satisfies(`differ from ${initialThemeHref}`, (href) => href !== initialThemeHref)

    await this.app.openSettings()
    await this.app.settingsGotoTab("general")
    assert.equal(await this.app.getGeneralDropdownValue("Theme"), nextTheme)
  })

  it("cancel button returns to the torrents page", async function () {
    await this.app.settingsCancel()
    await this.app.torrentsPageIsVisible()
  })

  it("save button returns to the torrents page", async function () {
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()
  })

  it("persists system startup preference", async function () {
    if (process.platform === "linux") {
      this.skip()
    }

    await this.app.settingsGotoTab("general")
    const initialSystemStartup = await this.app.getGeneralDropdownValue("System Startup")
    const nextSystemStartup = initialSystemStartup === "Start" ? "Disabled" : "Start"

    await this.app.selectGeneralDropdownValue("System Startup", nextSystemStartup)
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()

    await this.app.openSettings()
    await this.app.settingsGotoTab("general")
    assert.equal(await this.app.getGeneralDropdownValue("System Startup"), nextSystemStartup)

    await this.app.selectGeneralDropdownValue("System Startup", initialSystemStartup)
    await this.app.settingsSave()
    await this.app.torrentsPageIsVisible()
  })
})
