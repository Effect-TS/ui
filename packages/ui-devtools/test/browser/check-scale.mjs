import { run } from "./run.mts"

await run("scale", async ({ browser, expect, failures, url }) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))
  await page.goto(url + "scale.html")
  await page.waitForSelector("body[data-ready]", {
    state: "attached",
    timeout: 30_000
  })
  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  const settle = () => page.waitForTimeout(150)

  const list = () =>
    page.evaluate(() => {
      const doc = document.querySelector("iframe[data-effect-ui-devtools]")
        .contentDocument
      const box = doc.querySelector(".ilist")
      const items = Array.from(doc.querySelectorAll(".ilist .iitem"))
      return {
        fits: box === null ? 0 : Math.ceil(box.clientHeight / 26),
        rendered: items.length,
        names: items.map((item) =>
          item.querySelector(".irow").getAttribute("data-instance")
        )
      }
    })
  const bounded = (shown) =>
    shown.rendered > 0 && shown.rendered <= shown.fits + 8

  await page.click("[data-hold='s0-1']")
  await page.click("[data-drop]")
  await page.click("[data-fail='s7-3']")
  await page.click("[data-row='s5-5']")
  await settle()
  const alert = await frame.locator(".launch .alert").textContent()
  expect(
    alert === "1 failure",
    "the launcher counts the failure and not the interruption",
    alert
  )

  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .click()
  await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  await settle()
  const count = await frame.locator(".icount").textContent()
  expect(
    Number(count.replace(/,/g, "")) > 2000,
    "the heading counts every instance",
    count
  )

  const active = await list()
  const rank = (name) => active.names.indexOf(name)
  expect(
    rank("Row[s7-3]") >= 0 && rank("Row[s0-1]") >= 0 &&
      rank("Row[s5-5]") > Math.max(rank("Row[s7-3]"), rank("Row[s0-1]")),
    "failed and interrupted instances are listed above one that only took a message",
    active.names
  )
  expect(
    !active.names.some((name) =>
      name.startsWith("Section") || name.startsWith("Shelf")
    ),
    "an instance that only mounted is not listed",
    active.names
  )

  await frame.locator(".row[data-tag=Update]").first().click()
  await settle()
  const header = await frame.locator(".crumbs").textContent()
  const owner = await frame.locator(".irow.owner").getAttribute("data-instance")
  expect(
    header === "App/Section[s5]/Shelf[shelf]/Row[s5-5]" &&
      owner === "Row[s5-5]",
    "the selected entry's instance is listed and its path is in the entry header",
    { header, owner }
  )

  const find = frame.getByRole("searchbox", { name: "Find an instance" })
  await find.fill("row[s1-")
  await settle()
  const found = await list()
  expect(
    found.names.includes("Row[s1-0]"),
    "Find reaches an instance the active list does not show",
    found.names
  )
  expect(
    bounded(found),
    "the find results render only the rows their box shows",
    found
  )
  await find.fill("")

  await frame.getByRole("button", { name: /^Browse all/ }).click()
  await settle()
  const tree = await list()
  expect(bounded(tree), "the tree renders only the rows its box shows", tree)
  await page.evaluate(() => {
    document.querySelector("iframe[data-effect-ui-devtools]").contentDocument
      .querySelector(".ilist").scrollTop = 0
  })
  await settle()
  const appRoll = await frame.locator("[data-instance=App] .roll.tone-bad")
    .textContent()
  expect(
    appRoll === "2 failed or interrupted",
    "a parent counts a failure three levels below it",
    appRoll
  )
  await frame.getByRole("button", { name: "Back to active instances" }).click()
  await settle()

  await frame.locator(".crumb", { hasText: "Section[s5]" }).click()
  await settle()
  const scoped = await page.evaluate(() => {
    const doc =
      document.querySelector("iframe[data-effect-ui-devtools]").contentDocument
    return Array.from(
      doc.querySelectorAll(".row .who"),
      (who) => who.getAttribute("title")
    )
  })
  expect(
    scoped.length > 0 &&
      scoped.every((path) =>
        path === "/App/Section[s5]" || path.startsWith("/App/Section[s5]/")
      ),
    "a path segment scopes the timeline to that instance and the ones under it",
    scoped.slice(0, 5)
  )
  await frame.locator(".crumb", { hasText: "Section[s5]" }).click()

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("[data-row]"))
    for (let round = 0; round < 5; round++) {
      for (const button of buttons) button.click()
    }
  })
  await page.waitForTimeout(1000)
  await frame.getByRole("button", { name: "Follow latest" }).click()
  await settle()
  const busy = await list()
  expect(
    busy.fits > 0 && bounded(busy),
    "the active list renders only the rows its box shows",
    busy
  )
  await frame.locator(".row[data-tag=Update]").first().click()
  await settle()
  const seqs = await page.evaluate(() => {
    const doc =
      document.querySelector("iframe[data-effect-ui-devtools]").contentDocument
    return Array.from(doc.querySelectorAll(".row .seq"), (seq) => ({
      text: seq.textContent,
      over: seq.scrollWidth > seq.clientWidth
    }))
  })
  expect(
    seqs.length > 0 && seqs[0].text.length >= 5 &&
      !seqs.some((seq) => seq.over),
    "after 10,000 entries the seq column holds every seq",
    seqs.slice(0, 3)
  )
  const sub = await frame.locator(".ehead .sub").textContent()
  expect(
    /\d+:\d{2}\.\d{3} after start$/.test(sub),
    "the sub line reads in minutes and seconds",
    sub
  )
})
