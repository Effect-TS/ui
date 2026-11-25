import * as fs from "node:fs"
import * as path from "node:path"
import { DevToolsVite } from "../../src/node/index.ts"
import { run } from "./run.mts"

const repo = path.resolve(import.meta.dirname, "../../../..")
const root = fs.mkdtempSync(path.join(import.meta.dirname, ".hot-tmp-"))

const write = (name, source) =>
  fs.writeFileSync(path.join(root, name), source, "utf8")

const on = (page) => ({
  text: (selector) => page.locator(selector).textContent(),
  shows: (selector, value) =>
    page.waitForFunction(
      ([selector, value]) =>
        document.querySelector(selector)?.textContent === value,
      [selector, value]
    ),
  edit: (name, source) => {
    write(name, source)
    // Saves a few milliseconds apart can reach the page as one update.
    return page.waitForTimeout(700)
  }
})

const collectTags = (ws, logTags) =>
  ws.on("framesent", ({ payload }) => {
    if (typeof payload !== "string") return
    try {
      const parsed = JSON.parse(payload)
      if (typeof parsed?._tag === "string") logTags.push(parsed._tag)
    } catch {
      return
    }
  })

const html = (script) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="/${script}"></script></head><body><div id="root"></div></body></html>`

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

const counterSource = (name, label) => `
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const Message = UiSchema.TaggedEnum({ Inc: {} })

export const ${name} = Html.component({
  name: "${name}",
  model: Schema.Number,
  message: Message
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.button.attr("data-${name}", "").on("click", Message.Inc())
      .children(\`${label}=\${count}\`)
})
`

// Exports only a function that draws its private component.
const hiddenSource = (label) =>
  counterSource("Hidden", label).replace(
    "export const Hidden",
    "const Hidden"
  ) +
  "export const drawHidden = (h: any) => Hidden(h, { key: \"h\" })\n"

const parentSource = (heading) => `
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { drawHidden } from "./hidden.ts"
import { Kid } from "./kid.ts"

const Message = UiSchema.TaggedEnum({ Inc: {} })

export const Parent = Html.component({
  name: "Parent",
  model: Schema.Number,
  message: Message
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h) =>
    h.div(
      h.h1(${JSON.stringify(heading)}),
      Kid(h, { key: "k" }),
      drawHidden(h)
    )
})
`

write("children.html", html("children-main.ts"))
write(
  "children-main.ts",
  `import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Parent } from "./parent.ts"
const Main = BrowserHost.mount(Parent, {}, document.getElementById("root")!)
Layer.launch(Main).pipe(Effect.runFork)
`
)
write("parent.ts", parentSource("Parent"))
write("kid.ts", counterSource("Kid", "K"))
write("hidden.ts", hiddenSource("H"))

const snakeDir = path.join(root, "snake")
fs.cpSync(path.join(repo, "examples/snake/src"), path.join(snakeDir, "src"), {
  recursive: true,
  filter: (from) => !from.endsWith(".test.ts")
})
write(
  "snake/package.json",
  JSON.stringify({ imports: { "#domain/*": "./src/domain/*.ts" } })
)
write("snake.html", html("snake/src/main.ts"))
const snakeGame = fs.readFileSync(
  path.join(snakeDir, "src/SnakeGame.ts"),
  "utf8"
)
const snakeMain = fs.readFileSync(path.join(snakeDir, "src/main.ts"), "utf8")

try {
  await run("hot reload", async ({ browser, expect, failures, url }) => {
    const page = await browser.newPage()
    const warnings = []
    let expectingError = false
    const sockets = new Set()
    const logTags = []
    page.on("websocket", (ws) => {
      if (!ws.url().includes(":47769/")) return
      sockets.add(ws)
      ws.on("close", () => sockets.delete(ws))
      if (ws.url().endsWith("/log")) collectTags(ws, logTags)
    })
    const liveSockets = (suffix) =>
      [...sockets].filter((ws) => !ws.isClosed() && ws.url().endsWith(suffix))
        .length
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text())
      if (msg.type() === "error" && !expectingError) {
        failures.push("console error: " + msg.text())
      }
    })
    page.on("pageerror", (error) => {
      failures.push("pageerror: " + String(error))
    })

    const { shows, text } = on(page)
    const count = async () => Number(await text("[data-count]"))
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
    await page.waitForTimeout(100)
    const explicitFrames = await page.locator(
      "iframe[data-effect-ui-devtools]"
    ).count()
    expect(
      explicitFrames === 1,
      "explicit DevTools.layer takes over with one overlay",
      { explicitFrames }
    )
    expect(
      liveSockets("/log") === 1 && liveSockets("/control") === 1,
      "explicit DevTools.layer keeps one /log and one /control socket",
      { log: liveSockets("/log"), control: liveSockets("/control") }
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

    sockets.clear()
    logTags.length = 0
    await page.goto(url + "routed.html")
    await shows("[data-routed-label]", "r1")
    await page.waitForTimeout(150)
    const sessionStarted = logTags.filter((t) => t === "SessionStarted").length
    const mounted = logTags.filter((t) => t === "Mounted").length
    expect(
      sessionStarted === 1 && mounted === 1,
      "plain head-entry mount sends SessionStarted and Mounted once",
      { sessionStarted, mounted, logTags }
    )
    const plainFrames = await page.locator("iframe[data-effect-ui-devtools]")
      .count()
    expect(
      plainFrames === 1 && liveSockets("/log") === 1 &&
        liveSockets("/control") === 1,
      "plain head-entry mount has one overlay and one socket pair",
      {
        plainFrames,
        log: liveSockets("/log"),
        control: liveSockets("/control")
      }
    )
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
    experimental: { hmrPartialAccept: false },
    server: { fs: { allow: [root, repo] } }
  })

  await run("hot update", async ({ browser, expect, failures, url }) => {
    const page = await browser.newPage()
    const logTags = []
    let loads = 0
    page.on("load", () => loads++)
    page.on("websocket", (ws) => {
      if (ws.url().endsWith(":47770/log")) collectTags(ws, logTags)
    })
    page.on("console", (msg) => {
      if (msg.type() === "error") failures.push("console error: " + msg.text())
    })
    page.on("pageerror", (error) => {
      failures.push("pageerror: " + String(error))
    })

    const cells = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".w-6")].map((cell) => cell.className)
          .join("|")
      )
    const { edit, shows, text } = on(page)
    const titled = (text) => shows("h1", text)
    const reloadWith = (name, source) =>
      Promise.all([page.waitForEvent("load"), edit(name, source)])

    await page.goto(url + "snake.html")
    await titled("Snake Game")
    await page.keyboard.press(" ")
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Playing")
    )
    await page.waitForTimeout(400)
    await page.keyboard.press(" ")
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Paused")
    )
    const paused = await cells()
    const documentTitle = await page.title()
    await page.evaluate(() => {
      window.hotH1 = document.querySelector("h1")
    })
    loads = 0
    logTags.length = 0

    await edit(
      "snake/src/SnakeGame.ts",
      snakeGame.replace("\"Snake Game\"", "\"Snake Edited\"")
    )
    await titled("Snake Edited")
    await page.waitForTimeout(200)
    expect(loads === 0, "title edit loaded no page", { loads })
    expect(
      await page.evaluate(() => document.querySelector("h1") === window.hotH1),
      "title edit kept the h1 node",
      {}
    )
    const edited = await cells()
    expect(edited === paused, "title edit kept the snake and apple", {})
    expect(
      (await page.title()) === documentTitle,
      "title edit kept the head",
      { before: documentTitle, after: await page.title() }
    )
    const replayed = logTags.filter((tag) =>
      tag === "Mounted" || tag.startsWith("Command")
    )
    expect(replayed.length === 0, "title edit ran no init or Command", {
      logTags
    })
    await page.keyboard.press(" ")
    await page.waitForFunction(
      (paused) =>
        [...document.querySelectorAll(".w-6")].map((cell) => cell.className)
          .join("|") !== paused,
      paused
    )
    await page.keyboard.press(" ")
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Paused")
    )

    const fresh = await cells()
    await reloadWith(
      "snake/src/main.ts",
      snakeMain.replace(
        "import { SnakeGame } from \"./SnakeGame.ts\"",
        "import { SnakeGame, SnakeGameModel } from \"./SnakeGame.ts\"\nvoid SnakeGameModel"
      )
    )
    await titled("Snake Edited")
    loads = 0
    await reloadWith(
      "snake/src/SnakeGame.ts",
      snakeGame.replace("\"Snake Game\"", "\"Snake Mixed\"")
    )
    await titled("Snake Mixed")
    expect(loads === 1, "edit under a mixed import reloaded the page", {
      loads
    })
    expect(
      (await cells()) === fresh,
      "edit under a mixed import kept the snake and apple",
      {}
    )

    const click = async (selector, value) => {
      await page.locator(selector).click()
      await shows(selector, value)
    }
    const sameKid = () =>
      page.evaluate(() =>
        document.querySelector("[data-Kid]") === window.hotKid
      )

    await page.goto(url + "children.html")
    await titled("Parent")
    await click("[data-Kid]", "K=1")
    await click("[data-Hidden]", "H=1")
    await page.evaluate(() => {
      window.hotKid = document.querySelector("[data-Kid]")
    })
    loads = 0

    await edit("kid.ts", counterSource("Kid", "K2"))
    await shows("[data-Kid]", "K2=1")
    expect(
      loads === 0 && await sameKid() && (await text("[data-Hidden]")) === "H=1",
      "child edit updated the clicked child in place",
      { loads, hidden: await text("[data-Hidden]") }
    )

    await edit("parent.ts", parentSource("Parent 2"))
    await titled("Parent 2")
    expect(
      loads === 0 && await sameKid() &&
        (await text("[data-Kid]")) === "K2=1" &&
        (await text("[data-Hidden]")) === "H=1",
      "parent edit kept the already-updated child in place",
      { loads, kid: await text("[data-Kid]") }
    )

    await edit("hidden.ts", hiddenSource("H2"))
    await shows("[data-Hidden]", "H2=1")
    expect(
      loads === 1 && (await text("[data-Kid]")) === "K2=1",
      "edit of a private child reloaded with the counters kept",
      { loads, kid: await text("[data-Kid]") }
    )

    await page.close()
  }, {
    root,
    plugins: [DevToolsVite.plugin({ port: 47770 })],
    server: { fs: { allow: [root, repo] } }
  })
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
