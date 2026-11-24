import { chromium } from "playwright"
import { createServer } from "vite"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const server = await createServer({ root: import.meta.dirname, logLevel: "silent", server: { port: 0 } })
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ executablePath })
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
page.on("pageerror", (error) => failures.push("page error " + String(error)))

const scene = () =>
  page.evaluate(() => {
    const live = document.getElementById("root")
    const copy = live.nextElementSibling?.hasAttribute("inert") ? live.nextElementSibling : null
    const rows = (root) => Array.from(root.querySelectorAll("li"), (row) => row.textContent.replace(/\s+/g, " ").trim())
    return {
      liveShown: getComputedStyle(live).display !== "none",
      live: rows(live),
      copy: copy === null ? null : rows(copy),
      empty: copy?.textContent.includes("Nothing here yet") ?? null
    }
  })

try {
  await page.goto(url)
  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await page.getByRole("button", { name: "Upload a file" }).click({ timeout: 10_000 })
  await frame.getByRole("button", { name: "Open the Effect UI inspector" }).click()
  await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  const entries = async () => Number((await frame.locator(".bar .count").textContent()).split(" ")[0])

  const before = await entries()
  await frame.locator(".row-button", { hasText: "ClickedStartUpload" }).first().click()
  await frame.getByRole("button", { name: "Time travel" }).click({ timeout: 5_000 })
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  await frame.locator(".row-button", { hasText: "Mounted" }).first().click()
  await page.waitForTimeout(200)
  const empty = await scene()
  expect(empty.empty === true && !empty.liveShown, "a jump to Mounted paints the empty page", empty)
  await frame.locator(".row-button", { hasText: "ClickedStartUpload" }).first().click()
  await page.waitForTimeout(200)
  const paused = await scene()
  expect(
    paused.copy?.length === 1 && paused.copy[0].includes("Uploading"),
    "the copy shows the upload as it was when it started",
    paused
  )
  expect((await entries()) === before, "painting and repainting log nothing", { before, after: await entries() })

  await frame.locator(".row-button", { hasText: "CompletedUploadFile" }).first().waitFor({ timeout: 10_000 })
  const finished = await scene()
  expect(!finished.liveShown, "the live root stays hidden while the upload finishes", finished)
  expect(finished.copy?.[0]?.includes("Uploading"), "the copy keeps the painted state", finished)
  expect(finished.live[0]?.includes("Done"), "the live root finished the upload unseen", finished)

  await frame.getByRole("button", { name: "Resume the live page" }).click({ timeout: 5_000 })
  await page.waitForTimeout(100)
  const resumed = await scene()
  expect(resumed.copy === null && resumed.liveShown, "Resume removes the copy and shows the live root", resumed)
  expect(resumed.live[0]?.includes("Done"), "the finished upload shows on Resume", resumed)
  await page.getByRole("button", { name: "Upload a file" }).click({ timeout: 5_000 })
  await page.getByRole("button", { name: "Cancel upload 1" }).waitFor({ timeout: 5_000 })
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
  await server.close()
}
for (const failure of failures) console.log(failure)
console.log(failures.length === 0 ? "devtools: ok" : "devtools: " + failures.length + " failed")
process.exitCode = failures.length === 0 ? 0 : 1
