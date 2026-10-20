import chai from "chai"
import { $, browser } from "@wdio/globals"
import { eventually } from "../../e2e/eventually"
import { configureSpec, enabledFeaturePaths, getTestFixture } from "../../framework/fixture"
import { CLIENT_METADATA } from "../../../src/shared/client-metadata"

const assert: Chai.AssertStatic = chai.assert
const fixture = getTestFixture()
const client = fixture.client

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

describe("application", function () {
  configureSpec()

  it("reports expected client features", async function () {
    const actualFeatures = await browser.execute(() => {
      const angular = (window as any).angular
      return angular.element(document.documentElement).injector().get("$rootScope").$btclient.features
    })
    const missingFeatures = enabledFeaturePaths(client.features as Record<string, unknown>)
      .filter((path) => path.split(".").reduce((value, key) => value?.[key], actualFeatures) !== true)

    assert.deepEqual(missingFeatures, [], `Missing enabled client features: ${missingFeatures.join(", ")}`)
  })

  it("reports the client version on the live sync status", async function () {
    const version = $(".status-bar .status-sync")
    await version.waitForDisplayed()
    assert.match(await version.getAttribute("title"), new RegExp(`^${escapeRegExp(CLIENT_METADATA[client.clientId].name)}\\s+\\S+`))
  })

  it("shows free disk space in the footer for clients that support it", async function () {
    if (client.features.freeDiskSpace !== true) {
      return this.skip()
    }

    await eventually(() => this.app.getTorrentsFooterText()).contains("Free")
  })

  it("shows the WebUI session rail with live sync, rates and public IP status", async function () {
    assert.equal(await $(".status-bar").getAttribute("aria-label"), "Session status")
    assert.equal(await $(".status-bar .status-sync").getText(), "Live sync")
    assert.isTrue(await $(".status-bar .status-dot.live").isExisting())
    assert.match(await $(".status-bar .download-speed").getText(), /\/s$/)
    assert.match(await $(".status-bar .upload-speed").getText(), /\/s$/)
    assert.isNotEmpty(await $(".status-bar .status-ip").getText())
    assert.notInclude(await $(".status-bar").getText(), "received")
  })

  it("toggles alternative rate limits from the status bar", async function () {
    if (client.features.alternativeSpeedLimits !== true) {
      return this.skip()
    }

    const button = $("[data-role='alternative-speed-limits']")
    await button.waitForDisplayed()

    const isActive = async () => ((await button.getAttribute("class")) || "").split(/\s+/).includes("active")
    const initial = await isActive()

    try {
      await button.waitForClickable()
      await button.click()
      await eventually(isActive).equals(!initial)
    } finally {
      if (await isActive() !== initial) {
        await button.waitForClickable()
        await button.click()
        await eventually(isActive).equals(initial)
      }
    }
  })
})
