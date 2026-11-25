import { run } from "./run.mts"

const timeline = (page) =>
  page.evaluate(() => {
    const doc =
      document.querySelector("iframe[data-effect-ui-devtools]").contentDocument
    const viewport = doc.querySelector(".timeline")
    const box = viewport.getBoundingClientRect()
    const rows = Array.from(doc.querySelectorAll(".row"), (row) =>
      Number(row.getAttribute("data-seq")))
    return {
      scrollTop: Math.round(viewport.scrollTop),
      top: Number(
        doc.elementFromPoint(box.left + 40, box.top + 4)?.closest(".row")
          ?.getAttribute("data-seq")
      ),
      newest: Math.max(...rows)
    }
  })

const type = async (page, text) => {
  await page.getByRole("textbox", { name: "Body n1" }).focus()
  for (const key of text) {
    await page.keyboard.type(key)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(250)
}

const atTop = (state) => state.scrollTop === 0 && state.top === state.newest

const wheel = async (page, frame, delta) => {
  const box = await frame.locator(".timeline").boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, delta)
  await page.waitForTimeout(300)
}

const readable = (frame, selector) =>
  frame.locator(selector).first().evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" })
    const doc = element.ownerDocument
    const box = element.getBoundingClientRect()
    const clip = {
      left: 0,
      top: 0,
      right: doc.documentElement.clientWidth,
      bottom: doc.documentElement.clientHeight
    }
    let scrolledSideways = false
    for (
      let node = element.parentElement;
      node !== null;
      node = node.parentElement
    ) {
      if (node.scrollLeft > 0) scrolledSideways = true
      const style = getComputedStyle(node)
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const rect = node.getBoundingClientRect()
        clip.left = Math.max(clip.left, rect.left)
        clip.top = Math.max(clip.top, rect.top)
        clip.right = Math.min(clip.right, rect.right)
        clip.bottom = Math.min(clip.bottom, rect.bottom)
      }
    }
    const hit = doc.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    )
    return {
      ok: box.width > 0 && !scrolledSideways && box.left >= clip.left - 0.5 &&
        box.right <= clip.right + 0.5 &&
        box.top >= clip.top - 0.5 && box.bottom <= clip.bottom + 0.5 &&
        hit !== null &&
        (element === hit || element.contains(hit)),
      text: element.textContent.replace(/\s+/g, " ").trim(),
      box: {
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top)
      },
      clip
    }
  })

await run("panel", async ({ browser, expect, failures, url }) => {
  const setup = async (context, query = "") => {
    const page = await context.newPage()
    page.on(
      "pageerror",
      (error) => failures.push("page error " + String(error))
    )
    await page.goto(url + query)
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
    await frame.getByRole("button", { name: "Open the Effect UI inspector" })
      .click()
    await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
    await page.waitForTimeout(100)
    return { page, frame }
  }

  const desktop = async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    })
    const { frame, page } = await setup(context)
    const panel = frame.getByRole("dialog", { name: "Effect UI inspector" })
    const openedBox = await panel.boundingBox()
    expect(
      Math.round(openedBox.width) === 920 &&
        Math.round(openedBox.height) === 560,
      "the panel opens at 920 by 560",
      openedBox
    )
    expect(
      Math.round(openedBox.x + openedBox.width) > 1400 &&
        Math.round(openedBox.y + openedBox.height) > 860,
      "the panel opens in the launcher's corner",
      openedBox
    )
    expect(
      !(await frame.getByRole("button", { name: "Back to the timeline" })
        .isVisible()),
      "a wide panel shows both columns without a back button",
      {}
    )

    const opened = await timeline(page)
    await type(page, "abcdefghij")
    let state = await timeline(page)
    expect(
      atTop(state) && state.newest > opened.newest,
      "a timeline at the top stays pinned to new events",
      state
    )

    await frame.locator(".row-button").nth(3).click()
    const heading = await readable(frame, ".ehead .headline")
    expect(
      heading.ok && heading.text === "UpdatedDraft",
      "selecting an entry shows its heading alongside the timeline",
      heading
    )
    await type(page, "klm")
    state = await timeline(page)
    expect(atTop(state), "selecting an entry keeps the timeline pinned", state)

    await wheel(page, frame, 200)
    const before = await timeline(page)
    await type(page, "nopq")
    const after = await timeline(page)
    expect(
      before.scrollTop > 0 && after.top === before.top &&
        after.scrollTop >= before.scrollTop + 4 * 28,
      "a reader farther down keeps their place",
      { before, after }
    )

    await frame.getByRole("button", { name: "Follow latest" }).click()
    await page.waitForTimeout(200)
    await type(page, "rst")
    state = await timeline(page)
    expect(atTop(state), "Follow latest pins the timeline again", state)

    await wheel(page, frame, 200)
    await wheel(page, frame, -2000)
    await type(page, "uv")
    state = await timeline(page)
    expect(
      atTop(state),
      "scrolling back to the top pins the timeline again",
      state
    )

    const grip = await frame.locator(".grip").boundingBox()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      grip.x + grip.width / 2 - 100,
      grip.y + grip.height / 2 - 60,
      { steps: 5 }
    )
    await page.mouse.up()
    await page.waitForTimeout(150)
    const resized = await panel.boundingBox()
    expect(
      Math.round(resized.width) === 1020 && Math.round(resized.height) === 620,
      "dragging the inner corner resizes the panel",
      resized
    )
    await page.reload()
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    await panel.waitFor()
    await page.waitForTimeout(150)
    const reopened = await panel.boundingBox()
    expect(
      Math.round(reopened.width) === 1020 &&
        Math.round(reopened.height) === 620,
      "reloading with the panel open keeps it open at its saved size",
      reopened
    )
    await frame.getByRole("button", { name: "Close the inspector" }).click()
    await frame.getByRole("button", { name: "Open the Effect UI inspector" })
      .waitFor()
    await page.reload()
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    await frame.getByRole("button", { name: "Open the Effect UI inspector" })
      .waitFor()
    expect(
      !(await panel.isVisible()),
      "reloading with the panel closed keeps it closed",
      {}
    )
    await context.close()
  }

  const narrow = async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    })
    const { frame, page } = await setup(context, "?capture=interrupted")
    await frame.locator("[data-instance=\"Editor[n2]\"]").click()
    await frame.locator(".row-button[aria-label$=\"Update ClickedSave\"]")
      .last()
      .click()

    const back = frame.getByRole("button", { name: "Back to the timeline" })
    expect(
      await back.isVisible(),
      "390x844: a narrow panel offers a way back to the timeline",
      {}
    )
    let seen = await readable(frame, ".ehead .headline")
    expect(
      seen.ok && seen.text === "ClickedSave",
      "390x844: the selected entry's title is readable",
      seen
    )
    seen = await readable(frame, ".tree .tl[data-change=changed]")
    expect(
      seen.ok && /"Dirty" → "Saving"/.test(seen.text),
      "390x844: the Dirty → Saving change is readable",
      seen
    )
    for (const tab of ["Model", "Message", "Commands", "Lifecycle", "Raw"]) {
      seen = await readable(frame, ".tabs .tab:has-text('" + tab + "')")
      expect(seen.ok, "390x844: the " + tab + " tab is readable", seen)
    }
    const escape = ".step[data-step=End] .cause button.ref"
    seen = await readable(frame, escape)
    expect(seen.ok, "390x844: the PressedEscape link is readable", seen)

    await page.setViewportSize({ width: 640, height: 480 })
    await page.waitForTimeout(100)
    expect(
      await back.isVisible(),
      "640x480: a narrow panel stays single-pane below 720px",
      {}
    )
    seen = await readable(frame, ".tree .tl[data-change=changed]")
    expect(
      seen.ok && /"Dirty" → "Saving"/.test(seen.text),
      "640x480: the Dirty → Saving change is readable",
      seen
    )

    await frame.locator(escape).click()
    seen = await readable(frame, ".ehead .headline")
    expect(
      seen.ok && seen.text === "PressedEscape",
      "narrow: following the link shows PressedEscape",
      seen
    )

    await back.click()
    seen = await readable(frame, ".row.selected")
    expect(
      seen.ok && /PressedEscape/.test(seen.text),
      "narrow: going back shows the timeline with PressedEscape selected",
      seen
    )
    await frame.getByRole("button", { name: "Follow latest" }).click()
    await frame.locator(".row-button").nth(2).click()
    seen = await readable(frame, ".ehead .headline")
    expect(seen.ok, "narrow: choosing another entry shows its detail", seen)
    const before = await timeline(page)
    await type(page, "abc")
    await back.click()
    await page.waitForTimeout(150)
    const after = await timeline(page)
    expect(
      atTop(after) && after.newest > before.newest,
      "narrow: the timeline stays pinned while an entry is shown",
      { before, after }
    )
    await context.close()
  }

  const corner = async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    })
    const page = await context.newPage()
    page.on(
      "pageerror",
      (error) => failures.push("page error " + String(error))
    )
    await page.goto(url)
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
    const launcher = frame.getByRole("button", {
      name: "Open the Effect UI inspector"
    })
    const panel = frame.getByRole("dialog", { name: "Effect UI inspector" })
    await launcher.waitFor()
    await page.waitForTimeout(100)

    const initial = await launcher.boundingBox()
    expect(
      initial.x + initial.width > 1400 && initial.y + initial.height > 860,
      "the launcher starts in the bottom-right corner",
      initial
    )

    await page.mouse.move(
      initial.x + initial.width / 2,
      initial.y + initial.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(100, 80, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const dragged = await launcher.boundingBox()
    expect(
      dragged.x <= 20 && dragged.y <= 20 && !(await panel.isVisible()),
      "dragging the launcher moves it to the top-left corner without opening the panel",
      dragged
    )

    await page.reload()
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    await launcher.waitFor()
    await page.waitForTimeout(100)
    const remembered = await launcher.boundingBox()
    expect(
      remembered.x <= 20 && remembered.y <= 20,
      "reloading remembers the launcher's saved corner",
      remembered
    )

    await launcher.click()
    await panel.waitFor()
    await page.waitForTimeout(100)
    const openedTopLeft = await panel.boundingBox()
    expect(
      openedTopLeft.x <= 20 && openedTopLeft.y <= 20,
      "clicking the moved launcher opens the panel in that corner",
      openedTopLeft
    )

    const picker = frame.getByRole("button", {
      name: "Move inspector to another corner"
    })
    await picker.focus()
    await page.keyboard.press("Enter")
    await frame.getByRole("button", { name: "Top right" }).waitFor()
    await page.keyboard.press("Escape")
    expect(
      !(await frame.locator(".corner-menu").isVisible()),
      "Escape closes the corner picker",
      {}
    )
    await picker.focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(100)
    const pickedTopRight = await panel.boundingBox()
    expect(
      pickedTopRight.x + pickedTopRight.width > 1400 && pickedTopRight.y <= 20,
      "the keyboard corner picker moves the inspector to the chosen corner",
      pickedTopRight
    )

    await frame.getByRole("button", { name: "Close the inspector" }).click()
    await launcher.waitFor()
    await launcher.focus()
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(100)
    const arrowMoved = await launcher.boundingBox()
    expect(
      arrowMoved.x + arrowMoved.width > 1400 &&
        arrowMoved.y + arrowMoved.height > 860 && !(await panel.isVisible()),
      "arrow keys on the focused launcher move it to another corner without opening the panel",
      arrowMoved
    )
    await context.close()
  }

  await desktop()
  await corner()
  await narrow()
})
