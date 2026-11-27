import { run } from "../../../ui-devtools/test/browser/run.mts"

await run("dialog", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))

  for (const mode of ["", "?shadow"]) {
    await page.goto(url + "dialog.html" + mode)
    await page.locator("dialog input").waitFor()
    await page.mouse.click(5, 5)
    await page.waitForTimeout(100)
    const open = await page.locator("dialog").count()
    expect(open === 0, "A press outside closes a modal dialog" + mode, open)
  }
}, { root: import.meta.dirname })
