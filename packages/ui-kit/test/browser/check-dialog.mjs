import { run } from "../../../ui-devtools/test/browser/run.mts"

await run("dialog", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))

  await page.goto(url + "dialog.html?shadow")
  await page.locator("dialog input").waitFor()
  await page.mouse.click(5, 5)
  await page.waitForTimeout(100)
  const openAfterPress = await page.locator("dialog").count()
  expect(
    openAfterPress === 0,
    "A press outside closes a modal dialog in a shadow root",
    openAfterPress
  )

  await page.goto(url + "dialog.html?shadow")
  await page.locator("dialog input").waitFor()
  await page.evaluate(() => {
    const host = document.getElementById("root")
    host.tabIndex = 0
    host.focus()
  })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(100)
  const openAfterEscape = await page.locator("dialog").count()
  expect(
    openAfterEscape === 0,
    "Escape closes a modal dialog while its shadow host has focus",
    openAfterEscape
  )

  // A closed root hides where an event came from, so these need its own tree.
  const aboveInClosedRoot = async () => {
    await page.goto(url + "dialog.html?shadow=closed")
    await page.waitForFunction(() =>
      shadow.querySelector("dialog input") !== null
    )
    await page.evaluate(() => {
      const above = shadow.appendChild(document.createElement("button"))
      above.popover = "manual"
      above.showPopover()
      above.focus()
    })
  }
  const open = () =>
    page.evaluate(() => shadow.querySelector("dialog") !== null)

  // A keydown sent while Escape bubbles leaves Escape handled once.
  await aboveInClosedRoot()
  await page.evaluate(() => {
    const above = shadow.querySelector("button[popover]")
    document.getElementById("root").addEventListener("keydown", () => {
      above.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "x",
          bubbles: true,
          composed: true
        })
      )
    }, { once: true })
  })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(100)
  expect(
    await open(),
    "Escape on a layer above a dialog in a closed root keeps it open",
    false
  )

  // An Escape stopped at the host, then sent again from the host itself.
  await aboveInClosedRoot()
  await page.evaluate(() => {
    const host = document.getElementById("root")
    host.addEventListener("keydown", (event) => event.stopPropagation(), {
      once: true
    })
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true,
      cancelable: true
    })
    shadow.querySelector("button[popover]").dispatchEvent(escape)
    host.dispatchEvent(escape)
  })
  await page.waitForTimeout(100)
  expect(
    !(await open()),
    "Escape sent again from a closed root's host closes the dialog",
    true
  )
}, { root: import.meta.dirname })
