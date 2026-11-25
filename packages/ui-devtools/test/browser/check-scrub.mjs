import { run } from "./run.mts"

const watch = (page) =>
  page.evaluate(() => {
    const frame = document.querySelector("iframe[data-effect-ui-devtools]")
    const doc = frame.contentDocument
    const text = (selector) => doc.querySelector(selector)?.textContent ?? ""
    const top = (selector) =>
      Math.round(doc.querySelector(selector).getBoundingClientRect().top)
    const seen = { toggles: 0, frames: [], done: false }
    frame.addEventListener("beforetoggle", () => seen.toggles++)
    const sample = () => {
      seen.frames.push({
        badge: text(".paused-label").replace("Paused at ", ""),
        slider: text(".scrub .at"),
        entry: "#" + /#(\d+)/.exec(text(".ehead .sub"))?.[1],
        pressed: doc.querySelector(".show")?.getAttribute("aria-pressed"),
        browse: top(".browse"),
        timeline: top(".timeline")
      })
      if (!seen.done) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    window.__scrub = seen
  })

await run("scrub", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))
  await page.goto(url + "scrub.html")
  await page.waitForSelector("body[data-ready]", { state: "attached" })
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: /^Count/ }).nth(i % 3).click()
  }

  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .click()
  await frame.getByRole("button", { name: "Everything" }).click()
  await frame.locator(".row-button", { hasText: "ClickedCount" }).first()
    .click()
  await page.evaluate(() => document.getElementById("held").showPopover())
  await frame.getByRole("button", { name: "Time travel", exact: true }).click()
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  await page.waitForTimeout(100)

  const slider = frame.getByRole("slider", { name: "Entry shown on the page" })
  const box = await slider.boundingBox()
  const max = Number(await slider.getAttribute("max"))
  const xOf = (stop) => box.x + 8 + (box.width - 16) * stop / max
  const y = box.y + box.height / 2
  let x = xOf(max)
  const drag = async (moves) => {
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (const [to, steps] of moves) {
      const from = x
      for (let step = 1; step <= steps; step++) {
        x = from + (xOf(to) - from) * step / steps
        await page.mouse.move(x, y)
        await page.waitForTimeout(16)
      }
    }
    await page.mouse.up()
    await page.waitForTimeout(200)
  }
  const onTop = () =>
    page.evaluate(() => {
      const held = document.getElementById("held")
      const box = held.getBoundingClientRect()
      return held.matches(":popover-open") &&
        document.elementFromPoint(box.left + 4, box.top + 4)
            ?.hasAttribute("data-effect-ui-devtools") === true
    })
  const toggles = () => page.evaluate(() => window.__scrub.toggles)

  await watch(page)
  await drag([[8, 30], [max, 30], [max - 6, 6]])
  const seen = {
    ...await page.evaluate(() => {
      window.__scrub.done = true
      return window.__scrub
    }),
    onTop: await onTop()
  }

  await page.evaluate(() => {
    const held = document.getElementById("held")
    held.hidePopover()
    held.showPopover()
  })
  const reopened = await onTop()
  await drag([[max - 7, 2]])
  const restored = await onTop()
  const before = await toggles()
  await drag([[max - 2, 10], [max - 5, 6]])
  expect(
    !reopened && restored,
    "the next paint raises the panel above a popover reopened over it",
    { reopened, restored }
  )
  expect(
    (await toggles()) === before && (await onTop()),
    "reversing after that leaves the panel in place, above the popover",
    { before, after: await toggles() }
  )
  const shown = new Set(seen.frames.map((frame) => frame.slider))
  expect(shown.size > 20, "the scrub went through the entries", [...shown])
  expect(
    seen.toggles === 0,
    "the panel stays in the top layer while scrubbing",
    seen.toggles
  )
  expect(
    seen.onTop,
    "the panel stays above a popover held open under it",
    seen.onTop
  )
  const torn = seen.frames.filter((frame) =>
    frame.badge !== frame.slider || frame.entry !== frame.slider ||
    frame.pressed !== "true"
  )
  expect(
    torn.length === 0,
    "every frame shows one entry in the badge, slider and details, with Time travel on",
    torn.slice(0, 3)
  )
  const layouts = new Set(
    seen.frames.map((frame) => frame.browse + "/" + frame.timeline)
  )
  expect(layouts.size === 1, "the panes keep their place", [...layouts])
})
