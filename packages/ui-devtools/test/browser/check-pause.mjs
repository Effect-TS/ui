import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  logLevel: "silent",
  resolve: { alias: { "@effect/ui-devtools": fileURLToPath(new URL("../../src/index.ts", import.meta.url)) } },
  server: { port: 0, strictPort: false }
})
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ executablePath })
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const scene = (page) =>
  page.evaluate(() => {
    const live = document.getElementById("root")
    const copy = live.nextElementSibling?.hasAttribute("inert") ? live.nextElementSibling : null
    const describe = (root) =>
      root === null ? null : {
        count: root.querySelector("main > button").textContent,
        dialog: (({ open, matches }) => ({
          open,
          modal: matches.call(root.querySelector("dialog"), ":modal"),
          popover: matches.call(root.querySelector("dialog"), ":popover-open")
        }))(root.querySelector("dialog")),
        menu: root.querySelector("[popover]:not(dialog)").matches(":popover-open"),
        editor: root.querySelector(".editor").textContent,
        notes: root.querySelector(".notes")?.textContent ?? null,
        clicks: root.querySelector(".clicks").textContent,
        shown: Array.from(root.querySelectorAll(".shown"), (node) => node.textContent).join()
      }
    const frame = document.querySelector("iframe[data-effect-ui-devtools]")
    const panel = frame.getBoundingClientRect()
    const dialog = (copy ?? live).querySelector("dialog").getBoundingClientRect()
    const x = Math.max(panel.left, dialog.left) + 4
    const y = Math.max(panel.top, dialog.top) + 4
    return {
      panelOnTop: x > Math.min(panel.right, dialog.right) || y > Math.min(panel.bottom, dialog.bottom) ||
        document.elementFromPoint(x, y) === frame,
      frameInTopLayer: frame.matches(":popover-open"),
      liveShown: getComputedStyle(live).display !== "none",
      live: describe(live),
      copy: describe(copy),
      inert: document.querySelectorAll("[inert]").length,
      blocked: document.querySelector(":modal") !== null
    }
  })

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
page.on("pageerror", (error) => failures.push("page error " + String(error)))
try {
  await page.goto(url + "pause.html")
  await page.waitForSelector("body[data-ready]", { state: "attached" })

  await page.getByRole("button", { name: "Count 0" }).click()
  await page.getByRole("button", { name: "Open menu" }).click()
  await page.getByRole("button", { name: "Open dialog" }).click()
  await page.getByRole("dialog", { name: "Settings" }).waitFor()
  await page.getByRole("button", { name: "Close dialog" }).click()
  await page.getByRole("button", { name: "Count 1" }).click()
  await page.getByRole("button", { name: "Count 2" }).waitFor()
  await page.getByText("Editor ready").waitFor()
  const before = await scene(page)
  expect(before.live.dialog.open === false && before.copy === null, "live page settles with the dialog closed", before)

  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await frame.getByRole("button", { name: "Open the Effect UI inspector" }).click()
  await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  await frame.locator(".row-button", { hasText: "ClickedOpenDialog" }).first().click()
  await frame.getByRole("button", { name: "Show on page" }).click({ timeout: 5_000 })
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  await page.waitForTimeout(100)

  const paused = await scene(page)
  expect(!paused.liveShown, "the live root is hidden while paused", paused)
  expect(paused.copy?.count === "Count 1", "the copy shows the count at the entry", paused.copy)
  expect(
    paused.copy?.dialog.popover === true && !paused.copy.dialog.modal,
    "the copy's modal dialog shows as a manual popover, not as a modal",
    paused.copy
  )
  expect(paused.copy?.menu === true, "the copy's popover shows", paused.copy)
  expect(!paused.blocked, "nothing on the page is a modal", paused)
  expect(paused.inert === 1, "only the copy is inert", paused)
  expect(paused.frameInTopLayer && paused.panelOnTop, "the panel stays above the copy's dialog", paused)
  expect(
    paused.copy?.editor === "Editor loading" && paused.copy.notes === "Notes",
    "the copy's feature slot shows its fallback and its sibling renders",
    paused.copy
  )
  expect(paused.live.editor === "Editor ready", "the live feature slot stays ready", paused.live)
  const notes = await frame.locator(".pause-note").allTextContents()
  expect(
    notes.length === 1 && notes[0].includes("fallback") && notes[0].endsWith(": /Scene/Panel[p]"),
    "the bar names only the instance whose slot shows its fallback",
    notes
  )

  await frame.getByRole("button", { name: "Close the inspector" }).click()
  const launcher = frame.getByRole("button", { name: "Open the Effect UI inspector" })
  await launcher.waitFor()
  const badge = await frame.locator(".launch .paused-label").textContent()
  expect(/^Paused at #\d+$/.test(badge ?? ""), "the closed launcher shows Paused", badge)
  expect((await scene(page)).copy !== null, "closing the panel keeps the page paused", null)

  const box = await page.locator("[inert] main > button").first().boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(100)
  const clicked = await scene(page)
  expect(
    clicked.live.clicks === paused.live.clicks && clicked.live.count === paused.live.count,
    "a physical click on the copy reaches no live handler or document listener",
    { before: paused.live, after: clicked.live }
  )

  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "d" })))
  await page.waitForTimeout(100)
  const opened = await scene(page)
  expect(
    opened.copy !== null && !opened.live.dialog.open && !opened.blocked,
    "a dialog the hidden live root opens while paused waits, and nothing is a modal",
    opened
  )

  await frame.locator(".launch").getByRole("button", { name: "Resume the live page" }).click({ timeout: 5_000 })
  await page.waitForTimeout(100)
  expect((await frame.locator(".launch .paused").count()) === 0, "Resume clears the launcher's badge", null)
  const resumed = await scene(page)
  expect(resumed.copy === null && resumed.inert === 0, "Resume removes the copy", resumed)
  expect(resumed.liveShown, "Resume shows the live root", resumed)
  expect(!resumed.frameInTopLayer, "Resume takes the panel out of the top layer", resumed)
  expect(
    resumed.live.dialog.modal === true,
    "the dialog the live root opened while paused is a modal after Resume",
    resumed
  )
  await page.getByRole("button", { name: "Close dialog" }).click({ timeout: 5_000 })
  await page.getByRole("button", { name: "Count 2" }).click({ timeout: 5_000 })
  await page.getByRole("button", { name: "Count 3" }).waitFor({ timeout: 5_000 })
  await page.getByRole("button", { name: "Open menu" }).click({ timeout: 5_000 })
  await page.getByRole("button", { name: "Open dialog" }).click({ timeout: 5_000 })
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ timeout: 5_000 })
  const live = await scene(page)
  expect(live.live.dialog.modal === true, "the live dialog opens as a modal again", live)
  await page.getByRole("button", { name: "Close dialog" }).click({ timeout: 5_000 })

  await frame.getByRole("button", { name: "Open the Effect UI inspector" }).click()
  await frame.getByRole("button", { name: "Everything" }).click()
  await frame.locator("[data-instance=\"Shown[a]\"]").click()
  await frame.locator(".row[data-tag=PropsChanged] .row-button").first().click()
  await frame.getByRole("button", { name: "Show on page" }).click({ timeout: 5_000 })
  await page.waitForTimeout(100)
  const between = await scene(page)
  expect(
    between.copy?.shown === "3,2" && between.live.shown === "3,3",
    "between two siblings' PropsChanged, each shows the props it had",
    between
  )
  await frame.getByRole("button", { name: "Resume the live page" }).first().click({ timeout: 5_000 })
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
  await server.close()
}
for (const failure of failures) console.log(failure)
console.log(failures.length === 0 ? "pause: ok" : "pause: " + failures.length + " failed")
process.exitCode = failures.length === 0 ? 0 : 1
