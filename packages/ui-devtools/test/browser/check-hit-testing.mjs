import { run } from "./run.mts"

await run("hit testing", async ({ browser, failures, url }) => {
  const check = async (position, open) => {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 760 }
    })
    page.on(
      "pageerror",
      (error) => failures.push(position + ": page error " + String(error))
    )
    await page.goto(url + "?position=" + position)
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
    const launcher = frame.getByRole("button", {
      name: "Open the Effect UI inspector"
    })
    await launcher.waitFor()
    if (open) await launcher.click()
    const shape = open
      ? frame.getByRole("dialog", { name: "Effect UI inspector" })
      : launcher
    await shape.waitFor()
    await page.waitForTimeout(100)
    const box = await shape.boundingBox()
    const name = position + (open ? " panel" : " launcher")
    const clicks = () => page.evaluate(() => globalThis.counts.clicks)
    const r = Math.min(8, box.height / 2)
    const outside = [
      [box.x - 2, box.y + box.height / 2],
      [box.x + box.width + 2, box.y + box.height / 2],
      [box.x + box.width / 2, box.y - 2],
      [box.x + box.width / 2, box.y + box.height + 2],
      [box.x + 1, box.y + 1],
      [box.x + box.width - 1, box.y + box.height - 1]
    ].filter(([x, y]) => x >= 0 && y >= 0 && x < 1100 && y < 760)
    for (const [x, y] of outside) {
      const before = await clicks()
      await page.mouse.click(x, y)
      if ((await clicks()) !== before + 1) {
        failures.push(name + ": a click at " + x + "," + y + " missed the page")
      }
    }
    const before = await clicks()
    await page.mouse.click(
      box.x + box.width / 2,
      box.y + Math.min(r * 2, box.height / 2)
    )
    if ((await clicks()) !== before) {
      failures.push(name + ": a click inside reached the page")
    }
    if (open) {
      await frame.getByRole("button", { name: "Follow latest" }).focus()
      const keys = await page.evaluate(() => globalThis.counts.keys)
      await page.keyboard.press("Escape")
      if ((await page.evaluate(() => globalThis.counts.keys)) !== keys) {
        failures.push(name + ": Escape reached the page")
      }
    }
    await page.close()
  }

  for (const position of ["BottomRight", "TopLeft"]) {
    await check(position, false)
    await check(position, true)
  }
})
