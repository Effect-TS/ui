import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./pause.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2023",
  logLevel: "silent"
})
const html = `<!doctype html>
<html>
  <head><style>body { margin: 0; font: 14px system-ui; } main { display: flex; gap: 8px; padding: 24px; }</style></head>
  <body>
    <button id="resume">Resume</button>
    <div id="root" style="display: flex"></div>
    <script type="module">${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>
  </body>
</html>`

const browser = await chromium.launch({ executablePath })
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const scene = (page) =>
  page.evaluate(() => {
    const live = document.getElementById("root")
    const copy = live.nextElementSibling?.hasAttribute("inert") ? live.nextElementSibling : null
    return {
      model: globalThis.check.model(),
      liveShown: getComputedStyle(live).display === "flex",
      liveDialogOpen: live.querySelector("dialog").open,
      liveModal: live.querySelector("dialog").matches(":modal"),
      copy: copy?.querySelector(".count").textContent ?? null,
      liveMenuOpen: live.querySelector(".menu").matches(":popover-open"),
      blocked: document.querySelector(":modal") !== null
    }
  })

const clickAt = async (page, locator) => {
  const box = await locator.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(100)
}

const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
page.on("pageerror", (error) => failures.push("page error " + String(error)))
await page.route("http://check.test/", (route) => route.fulfill({ contentType: "text/html", body: html }))
try {
  await page.goto("http://check.test/")
  await page.waitForSelector("body[data-ready]", { state: "attached" })

  await clickAt(page, page.locator("#root:not([inert]) .count"))
  const live = await scene(page)
  expect(live.model.count === 1 && live.model.heard === 1, "a click on the live page reaches both handlers", live)

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false, menu: false, toggles: 0 }))
  await clickAt(page, page.locator("[inert] .count"))
  const clicked = await scene(page)
  expect(clicked.copy === "Count 5" && !clicked.liveShown, "pause shows the copy and hides the live page", clicked)
  expect(
    clicked.model.count === 1 && clicked.model.heard === 1,
    "a physical click on the copy reaches no live listener",
    clicked.model
  )

  await page.evaluate(() => globalThis.check.open())
  await page.waitForTimeout(100)
  const opened = await scene(page)
  expect(
    opened.model.dialog && !opened.liveDialogOpen && !opened.blocked,
    "a live modal opened while paused waits",
    opened
  )

  await clickAt(page, page.locator("#resume"))
  const resumed = await scene(page)
  expect(
    resumed.copy === null && resumed.liveShown && resumed.liveModal,
    "a physical click on Resume resumes, and the live modal shows",
    resumed
  )

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false, menu: false, toggles: 0 }))
  const again = await scene(page)
  expect(!again.blocked && !again.liveDialogOpen, "pausing closes the open live modal", again)
  await clickAt(page, page.locator("#resume"))
  const back = await scene(page)
  expect(back.copy === null && back.liveModal && back.model.dialog, "Resume shows the live modal again", back)

  await clickAt(page, page.locator("#root:not([inert]) .close"))
  const closed = await scene(page)
  expect(!closed.model.dialog && !closed.blocked, "the live page takes clicks after Resume", closed)

  await clickAt(page, page.locator("#root:not([inert]) .open-menu"))
  const menu = await scene(page)
  expect(menu.model.menu && menu.liveMenuOpen, "the live menu opens", menu)
  const toggles = menu.model.toggles

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false, menu: false, toggles: 0 }))
  await clickAt(page, page.locator("[inert] .count"))
  await page.mouse.click(400, 500)
  await page.waitForTimeout(100)
  const clickedMenu = await scene(page)
  expect(
    clickedMenu.model.toggles === toggles && clickedMenu.model.menu,
    "pausing and clicking the copy dispatch no onToggle to the live Model",
    clickedMenu.model
  )

  await clickAt(page, page.locator("#resume"))
  const resumedMenu = await scene(page)
  expect(
    resumedMenu.copy === null && resumedMenu.model.menu && resumedMenu.liveMenuOpen &&
      resumedMenu.model.toggles === toggles,
    "Resume shows the live menu open again, with no onToggle",
    resumedMenu
  )

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false, menu: false, toggles: 0 }))
  await page.evaluate(() => globalThis.check.menu(false))
  await page.waitForTimeout(100)
  await clickAt(page, page.locator("#resume"))
  const closedMenu = await scene(page)
  expect(
    !closedMenu.model.menu && !closedMenu.liveMenuOpen,
    "a menu the live Model closed while paused stays closed on Resume",
    closedMenu
  )

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false, menu: false, toggles: 0 }))
  await page.evaluate(() => globalThis.check.menu(true))
  await page.waitForTimeout(100)
  const waiting = await scene(page)
  expect(!waiting.liveMenuOpen, "a menu the live Model opens while paused waits", waiting)
  await clickAt(page, page.locator("[inert] .count"))
  await clickAt(page, page.locator("#resume"))
  const openedMenu = await scene(page)
  expect(
    openedMenu.model.menu && openedMenu.liveMenuOpen && openedMenu.model.toggles === toggles + 1,
    "a menu the live Model opened while paused shows on Resume, reporting its own toggle",
    openedMenu
  )
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log("check-pause: ok")
