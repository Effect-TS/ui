import { run } from "./run.mts"

const scene = (page) =>
  page.evaluate(() => {
    const live = document.getElementById("root")
    const copy = live.nextElementSibling?.hasAttribute("inert")
      ? live.nextElementSibling
      : null
    const describe = (root) =>
      root === null ? null : {
        count: root.querySelector("main > button").textContent,
        dialog: (({ open, matches }) => ({
          open,
          modal: matches.call(root.querySelector("dialog"), ":modal"),
          popover: matches.call(root.querySelector("dialog"), ":popover-open")
        }))(root.querySelector("dialog")),
        menu: root.querySelector("[popover]:not(dialog)").matches(
          ":popover-open"
        )
      }
    const frame = document.querySelector("iframe[data-effect-ui-devtools]")
    const panel = frame.getBoundingClientRect()
    const dialog = (copy ?? live).querySelector("dialog")
      .getBoundingClientRect()
    const x = Math.max(panel.left, dialog.left) + 4
    const y = Math.max(panel.top, dialog.top) + 4
    copy?.removeAttribute("inert")
    const hit = document.elementFromPoint(x, y)
    copy?.setAttribute("inert", "")
    return {
      panelOnTop: x > Math.min(panel.right, dialog.right) ||
        y > Math.min(panel.bottom, dialog.bottom) ||
        hit === frame,
      frameInTopLayer: frame.matches(":popover-open"),
      liveShown: getComputedStyle(live).display !== "none",
      live: describe(live),
      copy: describe(copy),
      inert: document.querySelectorAll("[inert]").length,
      blocked: document.querySelector(":modal") !== null
    }
  })

await run("pause", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))
  await page.goto(url + "pause.html")
  await page.waitForSelector("body[data-ready]", { state: "attached" })

  await page.getByRole("button", { name: "Count 0" }).click()
  await page.getByRole("button", { name: "Open menu" }).click()
  await page.getByRole("button", { name: "Open dialog" }).click()
  await page.getByRole("dialog", { name: "Settings" }).waitFor()
  await page.getByRole("button", { name: "Close dialog" }).click()
  await page.getByRole("button", { name: "Count 1" }).click()
  await page.getByRole("button", { name: "Count 2" }).waitFor()

  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .click()
  await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  await frame.locator(".row-button", { hasText: "ClickedCount" }).last().click()
  const travel = frame.getByRole("button", { name: "Time travel", exact: true })
  const tooltip = await travel.getAttribute("title")
  expect(
    tooltip === "Open the time travel slider at this entry",
    "the Time travel toggle has its tooltip",
    tooltip
  )
  await travel.click({ timeout: 5_000 })
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  await frame.locator(".row-button", { hasText: "ClickedOpenDialog" }).first()
    .click()
  await page.waitForTimeout(150)

  const paused = await scene(page)
  expect(
    !paused.liveShown && paused.copy?.count === "Count 1",
    "the copy shows the entry while live is hidden",
    paused
  )
  expect(
    paused.copy?.dialog.popover === true && !paused.copy.dialog.modal,
    "the copy's modal dialog shows as a manual popover, not as a modal",
    paused.copy
  )
  expect(paused.copy?.menu === true, "the copy's popover shows", paused.copy)
  expect(
    !paused.blocked && paused.inert === 1,
    "nothing is a modal and only the copy is inert",
    paused
  )
  expect(
    paused.frameInTopLayer && paused.panelOnTop,
    "the panel stays above the copy's dialog",
    paused
  )

  await frame.getByRole("button", { name: "Close the inspector" }).click()
  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .waitFor()
  const badge = await frame.locator(".launch .paused-label").textContent()
  expect(
    /^Paused at #\d+$/.test(badge ?? ""),
    "the closed launcher shows Paused",
    badge
  )
  expect(
    (await scene(page)).copy !== null,
    "closing the panel keeps the page paused",
    null
  )

  await frame.locator(".launch").getByRole("button", {
    name: "Resume the live page"
  }).click({ timeout: 5_000 })
  await page.waitForTimeout(100)
  expect(
    (await frame.locator(".launch .paused").count()) === 0,
    "Resume clears the launcher's badge",
    null
  )
  const resumed = await scene(page)
  expect(
    resumed.copy === null && resumed.inert === 0 && resumed.liveShown,
    "Resume restores the live root",
    resumed
  )
  expect(
    !resumed.frameInTopLayer,
    "Resume takes the panel out of the top layer",
    resumed
  )

  await page.getByRole("button", { name: "Count 2" }).click({ timeout: 5_000 })
  await page.getByRole("button", { name: "Count 3" }).waitFor({
    timeout: 5_000
  })
  await page.getByRole("button", { name: "Open menu" }).click({
    timeout: 5_000
  })
  await page.getByRole("button", { name: "Open dialog" }).click({
    timeout: 5_000
  })
  await page.getByRole("dialog", { name: "Settings" }).waitFor({
    timeout: 5_000
  })
  const live = await scene(page)
  expect(
    live.live.dialog.modal === true,
    "the live dialog opens as a modal again",
    live
  )
})
