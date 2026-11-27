import { run } from "../../../ui-devtools/test/browser/run.mts"

await run("select", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))

  for (const mode of ["", "?shadow"]) {
    await page.goto(url + "select.html" + mode)
    // A real mouse click runs the browser's default mousedown focus, which a
    // dispatched event skips.
    await page.locator("#trigger").click()
    await page.waitForTimeout(100)
    const expanded = await page.locator("#trigger").getAttribute(
      "aria-expanded"
    )
    expect(expanded === "true", "A click opens the popup" + mode, expanded)
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(100)
    // Locators see into an open shadow root, which `document.activeElement`
    // doesn't.
    const [highlighted = null] = await page.locator(
      ".popup [data-highlighted]:focus-within"
    ).allTextContents()
    expect(
      highlighted === "Banana",
      "ArrowDown in a mouse-opened popup focuses Banana" + mode,
      highlighted
    )
  }

  // A parent that keeps the popup closed gets the trigger focused by the click.
  await page.goto(url + "select.html?decline")
  await page.locator("#field").click()
  await page.evaluate(() =>
    addEventListener("click", () => {
      globalThis.clicked = document.activeElement.id
    }, { once: true })
  )
  await page.locator("#trigger").click()
  const focused = await page.evaluate(() => globalThis.clicked)
  expect(
    focused === "trigger",
    "A declined mouse open focuses the trigger",
    focused
  )
}, { root: import.meta.dirname })
