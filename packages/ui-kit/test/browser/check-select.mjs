import { run } from "../../../ui-devtools/test/browser/run.mts"

await run("select", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))

  for (const [align, label] of [[true, "Banana"], [false, "Apple"]]) {
    await page.goto(url + "select.html?align=" + align)
    // A real mouse click runs the browser's default mousedown focus, which a
    // dispatched event skips.
    await page.locator("#trigger").click()
    await page.waitForTimeout(100)
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(100)
    const focused = await page.evaluate(() =>
      document.activeElement.closest(".popup [data-highlighted]")
        ?.textContent ?? null
    )
    expect(
      focused === label,
      "ArrowDown in a mouse-opened popup focuses " + label + ", align=" + align,
      focused
    )
  }

  // A parent that keeps the popup closed still gets the trigger focused.
  await page.goto(url + "select.html?decline")
  await page.locator("#field").click()
  await page.locator("#trigger").click()
  await page.waitForTimeout(100)
  const focused = await page.evaluate(() => document.activeElement.id)
  expect(
    focused === "trigger",
    "A declined mouse open focuses the trigger",
    focused
  )
}, { root: import.meta.dirname })
