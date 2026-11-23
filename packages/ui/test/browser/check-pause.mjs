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

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false }))
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

  await page.evaluate(() => globalThis.check.pause({ count: 5, heard: 0, dialog: false }))
  const again = await scene(page)
  expect(!again.blocked && !again.liveDialogOpen, "pausing closes the open live modal", again)
  await clickAt(page, page.locator("#resume"))
  const back = await scene(page)
  expect(back.copy === null && back.liveModal && back.model.dialog, "Resume shows the live modal again", back)

  await clickAt(page, page.locator("#root:not([inert]) .close"))
  const closed = await scene(page)
  expect(!closed.model.dialog && !closed.blocked, "the live page takes clicks after Resume", closed)
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
