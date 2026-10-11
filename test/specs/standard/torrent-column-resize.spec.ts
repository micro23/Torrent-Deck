import chai from "chai"
import { $ } from "@wdio/globals"
import * as e2e from "../../e2e"
import { createTorrentFile } from "../../torrent"
import { configureSpec, createUniqueLabel, getTestFixture } from "../../framework/fixture"

const { assert } = chai
const fixture = getTestFixture()

describe("torrent column resizing", function () {
  configureSpec()

  it("lets a long torrent Name column shrink below 150 pixels", async function () {
    const filename = await createTorrentFile(fixture.tracker, {
      torrentName: createUniqueLabel("a-long-torrent-name-that-must-not-set-the-minimum-column-width"), fileSize: 1,
    })
    const torrent: e2e.Torrent = await this.app.uploadTorrent({ filename })
    try {
      await torrent.waitForExist({ timeout: 20_000 })
      const header = $("#torrentTable thead th[data-col='decodedName']")
      const width = (await header.getSize()).width
      await header.$(".rz-handle").dragAndDrop({ x: 110 - width, y: 0 })
      assert.isBelow((await header.getSize()).width, 150)
      assert.isAbove((await header.getSize()).width, 40)
      assert.equal(await torrent.isExisting(), true)
    } finally {
      if (await torrent.isExisting()) await torrent.delete()
    }
  })
})
