import * as fs from "node:fs"
import * as path from "node:path"
import { DevToolsVite } from "../../src/node/index.ts"
import { run } from "./run.mts"

const repo = path.resolve(import.meta.dirname, "../../../..")
const root = fs.mkdtempSync(path.join(import.meta.dirname, ".hot-tmp-"))

const write = (name, source) =>
  fs.writeFileSync(path.join(root, name), source, "utf8")

const html = (script) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/${script}"></script></body></html>`

const routedSource = (label) => `
import { Route, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const AppRoute = Route.union({
  Home: Route.make("/routed.html"),
  Other: Route.make("/other")
})

const Message = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute }
})

export const RoutedPage = Html.component({
  name: "RoutedPage",
  props: Schema.Struct({ route: AppRoute }),
  model: AppRoute,
  message: Message
}).make({
  init: ($) => $.props.route,
  update: (_, msg) => msg.route,
  subscriptions: ({ model }) => [
    Router.subscription(
      AppRoute,
      model,
      (route) => Message.ChangedRoute({ route })
    )
  ],
  view: (h) =>
    h.div.attr("style", "height:5000px").children(
      h.span.attr("data-routed-label", "").children(${JSON.stringify(label)})
    )
})
`

const timerSource = (label) => `
import { Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"

const Message = UiSchema.TaggedEnum({ Tick: {} })

export const Timer = Html.component({
  name: "Timer",
  model: Schema.Number,
  message: Message
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  subscriptions: () => [
    Subscription.make("timer/tick", "100ms", () =>
      Stream.tick("100 millis").pipe(Stream.map(() => Message.Tick()))
    )
  ],
  view: (h, count) =>
    h.div(
      h.span.attr("data-label", "").children(${JSON.stringify(label)}),
      h.span.attr("data-count", "").children(String(count))
    )
})
`

const incompatibleTimerSource = `
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const Message = UiSchema.TaggedEnum({ Tick: {} })

export const Timer = Html.component({
  name: "Timer",
  model: Schema.String,
  message: Message
}).make({
  init: () => "reset",
  update: ($) => $.model,
  view: (h, count) =>
    h.div(
      h.span.attr("data-label", "").children("v3"),
      h.span.attr("data-count", "").children(count)
    )
})
`

write("index.html", html("main.ts"))
write(
  "main.ts",
  `import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Timer } from "./timer.ts"
const Main = BrowserHost.mount(Timer, {}, document.getElementById("root")!).pipe(
  Layer.provide(DevTools.layer())
)
Layer.launch(Main).pipe(Effect.runFork)
`
)
write("timer.ts", timerSource("v1"))
write("routed.html", html("routed-main.ts"))
write(
  "routed-main.ts",
  `import { Router } from "@effect/ui"
import { BrowserHost, BrowserRouter } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { AppRoute, RoutedPage } from "./routed.ts"
const Main = BrowserHost.mount(
  RoutedPage,
  Router.props(AppRoute),
  document.getElementById("root")!
).pipe(
  Layer.provide(BrowserRouter.layer({ routes: AppRoute }))
)
Layer.launch(Main).pipe(Effect.runFork)
`
)
write("routed.ts", routedSource("r1"))

try {
  await run("hot reload", async ({ browser, expect, failures, url }) => {
    const page = await browser.newPage()
    const warnings = []
    let expectingError = false
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text())
      if (msg.type() === "error" && !expectingError) {
        failures.push("console error: " + msg.text())
      }
    })
    page.on("pageerror", (error) => {
      failures.push("pageerror: " + String(error))
    })

    const text = (selector) => page.locator(selector).textContent()
    const count = async () => Number(await text("[data-count]"))
    const shows = (selector, value) =>
      page.waitForFunction(
        ([selector, value]) =>
          document.querySelector(selector)?.textContent === value,
        [selector, value]
      )
    const counted = () =>
      page.waitForFunction(
        () => Number(document.querySelector("[data-count]")?.textContent) >= 3
      )
    const reloadWith = (name, source) =>
      Promise.all([
        page.waitForEvent("load"),
        Promise.resolve().then(() => write(name, source))
      ])

    await page.goto(url)
    await counted()
    const explicitFrames = await page.locator(
      "iframe[data-effect-ui-devtools]"
    ).count()
    expect(
      explicitFrames === 1,
      "explicit DevTools.layer takes over with one overlay",
      { explicitFrames }
    )
    const beforeEdit1 = await count()
    expect(
      (await text("[data-label]")) === "v1",
      "initial label",
      await text("[data-label]")
    )

    await reloadWith("timer.ts", timerSource("v2"))
    await shows("[data-label]", "v2")
    const afterEdit1 = await count()
    expect(afterEdit1 >= beforeEdit1, "count survived edit 1", {
      beforeEdit1,
      afterEdit1
    })

    const t0 = await count()
    await page.waitForTimeout(350)
    const t1 = await count()
    const delta = t1 - t0
    expect(delta >= 2 && delta <= 5, "single timer interval after edit 1", {
      t0,
      t1,
      delta
    })

    const beforeBreak = await count()
    expectingError = true
    await reloadWith("timer.ts", "export const Timer = (((broken")
    await page.waitForTimeout(150)
    expectingError = false
    await reloadWith("timer.ts", timerSource("v2-fixed"))
    await shows("[data-label]", "v2-fixed")
    const afterFix = await count()
    expect(afterFix >= beforeBreak, "count survived broken module", {
      beforeBreak,
      afterFix
    })

    warnings.length = 0
    await reloadWith("timer.ts", incompatibleTimerSource)
    await shows("[data-label]", "v3")
    expect(
      (await text("[data-count]")) === "reset",
      "incompatible edit reset to init",
      await text("[data-count]")
    )
    expect(
      warnings.some((text) =>
        text.includes("/Timer restarted from init") &&
        text.includes("no longer decodes")
      ),
      "incompatible edit logged warning",
      warnings
    )

    await reloadWith("timer.ts", timerSource("v4"))
    await counted()
    await page.reload()
    await page.waitForSelector("[data-count]")
    const afterManualReload = await count()
    expect(afterManualReload < 3, "manual reload started from init", {
      afterManualReload
    })

    await page.goto(url + "routed.html")
    await shows("[data-routed-label]", "r1")
    const autoFrame = page.frameLocator("iframe[data-effect-ui-devtools]")
    await autoFrame.getByRole("button", {
      name: "Open the Effect UI inspector"
    }).click()
    await autoFrame.getByRole("dialog", { name: "Effect UI inspector" })
      .waitFor()
    const inspectorText = await autoFrame.locator("body").textContent()
    expect(
      inspectorText?.includes("RoutedPage"),
      "auto-mounted DevTools captured RoutedPage without DevTools.layer",
      { inspectorText: inspectorText?.slice(0, 120) }
    )
    await autoFrame.getByRole("button", {
      name: "Close the inspector"
    }).click()
    await page.evaluate(() => window.scrollTo(0, 1500))
    await page.waitForFunction(() => window.scrollY === 1500)
    await reloadWith("routed.ts", routedSource("r2"))
    await shows("[data-routed-label]", "r2")
    await page.waitForFunction(() => window.scrollY === 1500, undefined, {
      timeout: 2000
    }).catch(() => {})
    const routedScrollY = await page.evaluate(() => window.scrollY)
    expect(routedScrollY === 1500, "routed page preserved scrollY", {
      routedScrollY
    })

    await page.close()
  }, {
    root,
    plugins: [DevToolsVite.plugin({ port: 47769 })],
    server: { fs: { allow: [root, repo] } }
  })
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
