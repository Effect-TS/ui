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
      "@effect/ui-devtools": fileURLToPath(
        new URL("../../src/index.ts", import.meta.url)
      )
    }
  },
  server: { port: 0, strictPort: false }
})
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ executablePath })
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
page.on("pageerror", (error) => failures.push("page error " + String(error)))
try {
  await page.goto(url + "parity.html")
  await page.waitForSelector("body[data-ready]", { state: "attached" })

  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .click()
  const dialog = frame.getByRole("dialog", { name: "Effect UI inspector" })
  await dialog.waitFor()
  await page.waitForTimeout(100)

  await page.getByRole("button", { name: "Toggle" }).click()
  await page.getByRole("button", { name: "Count" }).click()
  await page.waitForTimeout(100)

  const snapshot = () =>
    page.evaluate(() => {
      const doc = document.querySelector("iframe[data-effect-ui-devtools]")
        .contentDocument
      const rows = Array.from(
        doc.querySelectorAll(".row"),
        (row) => Number(row.getAttribute("data-seq"))
      )
      const instances = Array.from(
        doc.querySelectorAll(".irow"),
        (row) => row.getAttribute("data-instance")
      )
      return {
        count: doc.querySelector(".bar .count")?.textContent,
        rows,
        instances
      }
    })

  const beforeBurst = await snapshot()
  await page.evaluate(() => {
    const move = Array.from(document.querySelectorAll("button")).find((
      button
    ) => button.textContent === "Move")
    for (let i = 0; i < 80; i++) move.click()
  })
  await page.waitForTimeout(150)
  const afterBurst = await snapshot()
  expect(
    afterBurst.count === beforeBurst.count &&
      JSON.stringify(afterBurst.rows) === JSON.stringify(beforeBurst.rows),
    "a burst of excluded messages adds no rows and evicts nothing",
    { beforeBurst, afterBurst }
  )

  await page.getByRole("button", { name: "Count" }).click()
  await page.waitForTimeout(100)
  const burstModel = await frame.locator(".tree").textContent()
  expect(
    burstModel.includes("moves") && burstModel.includes("80") &&
      burstModel.includes("1 → 2"),
    "the next recorded entry's Model includes what the excluded burst changed",
    burstModel
  )

  const clear = frame.getByRole("button", { name: "Clear" })
  await frame.getByRole("button", { name: "Time travel", exact: true }).click()
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  expect(
    await clear.isDisabled(),
    "Clear is disabled while the page is paused",
    {}
  )
  await frame.getByRole("button", { name: "Resume the live page" }).click()
  await page.waitForTimeout(100)
  expect(!(await clear.isDisabled()), "Clear is enabled again after Resume", {})

  await clear.click()
  await page.waitForTimeout(100)
  const afterClear = await snapshot()
  expect(
    afterClear.count === "0 entries" && afterClear.rows.length === 0,
    "Clear empties the timeline",
    afterClear
  )
  expect(
    afterClear.instances.includes("Counter[counter]") &&
      afterClear.instances.includes("Side[side]"),
    "Clear keeps mounted instances in the instance list",
    afterClear.instances
  )

  await page.getByRole("button", { name: "Count" }).click()
  await page.waitForTimeout(100)
  const afterClearDiff = await frame.locator(".tree .tl[data-change=changed]")
    .textContent()
  expect(
    afterClearDiff.includes("count") && afterClearDiff.includes("2 → 3"),
    "the next entry after Clear shows a diff against the state before Clear",
    afterClearDiff
  )
  await frame.getByRole("button", { name: "Time travel", exact: true }).click()
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  const painted = await page.evaluate(() => {
    const copy = document.getElementById("root").nextElementSibling
    return {
      state: copy?.querySelector("#state")?.textContent,
      side: copy?.querySelector("#side")?.textContent
    }
  })
  expect(
    painted.state === "80:3" && painted.side === "on",
    "Time travel after Clear paints the pre-clear state of untouched instances too",
    painted
  )
  await frame.getByRole("button", { name: "Resume the live page" }).click()
  await page.waitForTimeout(100)

  await page.evaluate(() => {
    const count = Array.from(document.querySelectorAll("button")).find((
      button
    ) => button.textContent === "Count")
    for (let i = 0; i < 65; i++) count.click()
  })
  await page.waitForTimeout(200)
  const capped = await snapshot()
  expect(
    capped.count === "50 entries",
    "a size of 50 keeps 50 entries",
    capped.count
  )

  await page.reload()
  await page.waitForSelector("body[data-ready]", { state: "attached" })
  await dialog.waitFor({ timeout: 5_000 })
  expect(
    await dialog.isVisible(),
    "reloading the page with the panel open shows it open",
    {}
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
    ? "parity: ok"
    : "parity: " + failures.length + " failed"
)
process.exitCode = failures.length === 0 ? 0 : 1
