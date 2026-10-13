import { browser } from "@wdio/globals"

// WebDriver getSize reports unscaled CSS dimensions, while getLocation uses
// viewport coordinates. Keep all visual assertions in the same coordinate space.
export async function visibleBounds(selector: string) {
  const puppeteer = await browser.getPuppeteer()
  const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))
  const box = await (await page?.$(selector))?.boundingBox()
  if (!box) throw new Error(`No visible bounds for ${selector}`)
  return box
}

export async function dragVisibleElement(selector: string, x: number, y = 0) {
  const puppeteer = await browser.getPuppeteer()
  const page = (await puppeteer.pages()).find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))
  if (!page) throw new Error("Electron renderer page not found")
  const box = await visibleBounds(selector)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  try {
    await page.mouse.move(startX + x, startY + y, { steps: 10 })
  } finally {
    await page.mouse.up()
  }
}
