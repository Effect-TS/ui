import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  logLevel: "silent",
  resolve: {
    alias: {
      "@effect/ui-kit": fileURLToPath(
        new URL("../../src/index.ts", import.meta.url)
      )
    }
  },
  server: { port: 0, strictPort: false }
})
await server.listen()
const browser = await chromium.launch(
  executablePath === undefined ? undefined : { executablePath }
)
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const state = (page) =>
  page.evaluate(() => {
    const popup = document.querySelector(".popup")
    return {
      log: globalThis.check.log(),
      open: popup.parentElement.matches(":popover-open"),
      focusInPopup: popup.contains(document.activeElement),
      highlighted: popup.querySelector("[data-highlighted]")?.textContent ??
        null
    }
  })

// A real mouse click runs the browser's default mousedown focus, which a
// dispatched event skips.
const pressDown = async (page, align) => {
  await page.goto(server.resolvedUrls.local[0] + "select.html?align=" + align)
  await page.waitForSelector("body[data-ready]", { state: "attached" })
  await page.locator("#trigger").click()
  await page.waitForTimeout(100)
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(100)
  return state(page)
}

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))

  const aligned = await pressDown(page, true)
  expect(
    aligned.open && aligned.focusInPopup && aligned.highlighted === "Banana" &&
      !aligned.log.some((entry) => entry.startsWith("close")),
    "a mouse-opened popup over the trigger stays open, and ArrowDown moves from Apple to Banana",
    aligned
  )

  const below = await pressDown(page, false)
  expect(
    below.open && below.focusInPopup && below.highlighted === "Apple",
    "a mouse-opened popup below the trigger takes focus, and ArrowDown highlights Apple",
    below
  )
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
  await server.close()
}

for (const failure of failures) console.log(failure)
console.log(
  failures.length === 0
    ? "check-select: ok"
    : "check-select: " + failures.length + " failed"
)
if (failures.length > 0) process.exitCode = 1
