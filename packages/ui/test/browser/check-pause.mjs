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
      liveSubOpen: live.querySelector(".sub").matches(":popover-open"),
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

  await page.evaluate(() => globalThis.check.pause())
  await clickAt(page, page.locator("[inert] .count"))
  const clicked = await scene(page)
  expect(clicked.copy === "Count 5" && !clicked.liveShown, "pause shows the copy and hides the live page", clicked)
  expect(
    clicked.model.count === 1 && clicked.model.heard === 1,
    "a physical click on the copy reaches no live listener",
    clicked.model
  )

  await page.evaluate(() => document.dispatchEvent(new MouseEvent("click")))
  await page.waitForTimeout(100)
  const dispatched = await scene(page)
  expect(
    dispatched.model.count === 1 && dispatched.model.heard === 2,
    "a click dispatched on the document still reaches the live listener while paused",
    dispatched.model
  )

  await page.evaluate(() => globalThis.check.dialog(true))
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

  await clickAt(page, page.locator("#root:not([inert]) .close"))
  const closed = await scene(page)
  expect(!closed.model.dialog && !closed.blocked, "the live page takes clicks after Resume", closed)

  const counts = (scene) => [scene.model.toggles, scene.model.subToggles, scene.model.dialogToggles]
  const same = (a, b) => JSON.stringify(counts(a)) === JSON.stringify(counts(b))

  await page.evaluate(() => globalThis.check.dialog(true))
  await page.waitForTimeout(100)
  const dialogOpen = await scene(page)
  expect(dialogOpen.model.dialog && dialogOpen.liveModal, "the live modal opens, with onToggle", dialogOpen)
  await page.evaluate(() => globalThis.check.pause())
  await page.waitForTimeout(150)
  const dialogPaused = await scene(page)
  expect(
    dialogPaused.model.dialog && same(dialogPaused, dialogOpen) && !dialogPaused.blocked,
    "pausing closes the live modal without a toggle reaching its Model",
    dialogPaused
  )
  await clickAt(page, page.locator("#resume"))
  const dialogBack = await scene(page)
  expect(
    dialogBack.model.dialog && dialogBack.liveModal && same(dialogBack, dialogOpen),
    "Resume shows the live modal again without a toggle reaching its Model",
    dialogBack
  )
  await page.evaluate(() => globalThis.check.pause())
  await page.evaluate(() => globalThis.check.dialog(false))
  await page.waitForTimeout(100)
  await clickAt(page, page.locator("#resume"))
  const dialogClosed = await scene(page)
  expect(
    !dialogClosed.model.dialog && !dialogClosed.liveDialogOpen && !dialogClosed.blocked,
    "a modal the live Model closed while paused stays closed on Resume",
    dialogClosed
  )
  await page.evaluate(() => globalThis.check.dialog(true))
  await page.waitForTimeout(100)
  const reopened = await scene(page)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(100)
  const escaped = await scene(page)
  expect(
    !escaped.model.dialog && !escaped.liveDialogOpen &&
      escaped.model.dialogToggles === reopened.model.dialogToggles + 1,
    "after Resume, closing the live modal with Escape still reports its toggle",
    escaped
  )

  await clickAt(page, page.locator("#root:not([inert]) .open-menu"))
  await clickAt(page, page.locator("#root:not([inert]) .open-sub"))
  const nested = await scene(page)
  expect(
    nested.model.menu && nested.model.sub && nested.liveMenuOpen && nested.liveSubOpen,
    "the live menu and its submenu open",
    nested
  )
  await page.evaluate(() => globalThis.check.pause())
  await page.waitForTimeout(150)
  await clickAt(page, page.locator("[inert] .count"))
  await page.mouse.click(400, 500)
  await page.waitForTimeout(100)
  const nestedPaused = await scene(page)
  expect(
    nestedPaused.model.menu && nestedPaused.model.sub && same(nestedPaused, nested),
    "pausing and clicking leave the nested popovers' Model and toggle counts alone",
    nestedPaused
  )
  await clickAt(page, page.locator("#resume"))
  const nestedBack = await scene(page)
  expect(
    nestedBack.liveMenuOpen && nestedBack.liveSubOpen && nestedBack.model.menu && nestedBack.model.sub &&
      same(nestedBack, nested),
    "Resume shows the menu and its submenu again, with no toggle",
    nestedBack
  )

  await page.evaluate(() => globalThis.check.pause())
  await page.evaluate(() => globalThis.check.sub(false))
  await page.waitForTimeout(100)
  await clickAt(page, page.locator("#resume"))
  const subClosed = await scene(page)
  expect(
    subClosed.liveMenuOpen && !subClosed.liveSubOpen && subClosed.model.menu && !subClosed.model.sub &&
      same(subClosed, nested),
    "a submenu the live Model closed while paused stays closed on Resume, and its menu shows",
    subClosed
  )
  await page.evaluate(() => globalThis.check.pause())
  await page.evaluate(() => globalThis.check.sub(true))
  await page.waitForTimeout(100)
  const waitingSub = await scene(page)
  expect(!waitingSub.liveSubOpen, "a submenu the live Model opens while paused waits", waitingSub)
  await clickAt(page, page.locator("[inert] .count"))
  await clickAt(page, page.locator("#resume"))
  const subOpened = await scene(page)
  expect(
    subOpened.liveMenuOpen && subOpened.liveSubOpen && subOpened.model.sub &&
      subOpened.model.subToggles === nested.model.subToggles + 1 && subOpened.model.toggles === nested.model.toggles,
    "a submenu the live Model opened while paused shows on Resume, reporting its own toggle",
    subOpened
  )
  await page.mouse.click(400, 500)
  await page.waitForTimeout(100)
  const dismissed = await scene(page)
  expect(
    !dismissed.liveMenuOpen && !dismissed.liveSubOpen && !dismissed.model.menu && !dismissed.model.sub &&
      dismissed.model.toggles === subOpened.model.toggles + 1 &&
      dismissed.model.subToggles === subOpened.model.subToggles + 1,
    "after Resume, a light dismiss of the menu and submenu still reports both toggles",
    dismissed
  )

  const beforeDialog = await scene(page)
  await page.evaluate(() => {
    const dialog = document.querySelector("#root dialog")
    const observer = new MutationObserver(() => {
      observer.disconnect()
      globalThis.check.pause()
    })
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] })
    globalThis.check.dialog(true)
  })
  await page.waitForTimeout(150)
  const dialogPending = await scene(page)
  expect(
    dialogPending.copy !== null && !dialogPending.blocked && dialogPending.model.dialog &&
      dialogPending.model.dialogToggles === beforeDialog.model.dialogToggles,
    "pausing before a live modal's open toggle arrives sends no toggle while paused",
    dialogPending
  )
  await clickAt(page, page.locator("#resume"))
  const dialogPendingBack = await scene(page)
  expect(
    dialogPendingBack.liveModal && dialogPendingBack.model.dialog &&
      dialogPendingBack.model.dialogToggles === beforeDialog.model.dialogToggles + 1,
    "Resume delivers the pending modal's open toggle once",
    dialogPendingBack
  )
  await page.evaluate(() => globalThis.check.dialog(false))
  await page.waitForTimeout(100)

  await clickAt(page, page.locator("#root:not([inert]) .open-menu"))
  const beforeSub = await scene(page)
  await page.evaluate(() => {
    const sub = document.querySelector("#root .sub")
    const pauseOnOpen = (event) => {
      if (event.newState !== "open") return
      sub.removeEventListener("beforetoggle", pauseOnOpen)
      queueMicrotask(() => globalThis.check.pause())
    }
    sub.addEventListener("beforetoggle", pauseOnOpen)
    globalThis.check.sub(true)
  })
  await page.waitForTimeout(150)
  const subPending = await scene(page)
  expect(
    subPending.copy !== null && subPending.model.menu && subPending.model.sub && same(subPending, beforeSub),
    "pausing before a live submenu's open toggle arrives sends no toggle while paused",
    subPending
  )
  await clickAt(page, page.locator("#resume"))
  const subPendingBack = await scene(page)
  expect(
    subPendingBack.liveMenuOpen && subPendingBack.liveSubOpen && subPendingBack.model.sub &&
      subPendingBack.model.subToggles === beforeSub.model.subToggles + 1 &&
      subPendingBack.model.toggles === beforeSub.model.toggles,
    "Resume delivers the pending submenu's open toggle once",
    subPendingBack
  )

  const toggleCounts = async (open) => {
    const before = await scene(page)
    await page.evaluate(open)
    await page.waitForTimeout(150)
    const after = await scene(page)
    return [after.model.dialogToggles - before.model.dialogToggles, after.model.subToggles - before.model.subToggles]
  }
  await page.evaluate(() => globalThis.check.sub(false))
  await page.waitForTimeout(100)
  const baseline = [
    ...(await toggleCounts(() => globalThis.check.dialog(true))).slice(0, 1),
    ...(await toggleCounts(() => globalThis.check.sub(true))).slice(1)
  ]
  await page.evaluate(() => (globalThis.check.dialog(false), globalThis.check.sub(false)))
  await page.waitForTimeout(100)
  const pausedAround = [
    ...(await toggleCounts(() => {
      const dialog = document.querySelector("#root dialog")
      const observer = new MutationObserver(() => {
        observer.disconnect()
        globalThis.check.pause()
        globalThis.check.resume()
      })
      observer.observe(dialog, { attributes: true, attributeFilter: ["open"] })
      globalThis.check.dialog(true)
    })).slice(0, 1),
    ...(await toggleCounts(() => {
      const sub = document.querySelector("#root .sub")
      const pauseOnOpen = (event) => {
        if (event.newState !== "open") return
        sub.removeEventListener("beforetoggle", pauseOnOpen)
        queueMicrotask(() => (globalThis.check.pause(), globalThis.check.resume()))
      }
      sub.addEventListener("beforetoggle", pauseOnOpen)
      globalThis.check.sub(true)
    })).slice(1)
  ]
  const around = await scene(page)
  expect(
    JSON.stringify(baseline) === "[1,1]" && JSON.stringify(pausedAround) === JSON.stringify(baseline) &&
      around.liveModal && around.model.dialog && around.model.sub,
    "pausing and resuming before the open toggles arrive delivers the same toggles as no pause",
    { baseline, pausedAround, around }
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
