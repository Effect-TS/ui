import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"
import { DevToolsVite } from "../../src/node/index.ts"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const repo = path.resolve(import.meta.dirname, "../../../..")
const root = fs.mkdtempSync(path.join(import.meta.dirname, ".hot-tmp-"))

const writeTimer = (source) =>
  fs.writeFileSync(path.join(root, "timer.ts"), source, "utf8")

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

fs.writeFileSync(
  path.join(root, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/main.ts"></script></body></html>`,
  "utf8"
)
fs.writeFileSync(
  path.join(root, "main.ts"),
  `import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Timer } from "./timer.ts"
const Main = BrowserHost.mount(Timer, {}, document.getElementById("root")!).pipe(
  Layer.provide(DevTools.layer())
)
Layer.launch(Main).pipe(Effect.runFork)
`,
  "utf8"
)
writeTimer(timerSource("v1"))

const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  plugins: [DevToolsVite.plugin({ port: 47769 })],
  resolve: {
    alias: {
      "@effect/ui-devtools": fileURLToPath(
        new URL("../../src/index.ts", import.meta.url)
      )
    }
  },
  server: { port: 0, strictPort: false, fs: { allow: [root, repo] } }
})

const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  ...(executablePath === undefined ? undefined : { executablePath })
})

try {
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

  const label = () => page.locator("[data-label]").textContent()
  const count = async () =>
    Number(await page.locator("[data-count]").textContent())

  await page.goto(url)
  await page.waitForFunction(
    () => Number(document.querySelector("[data-count]")?.textContent) >= 3
  )
  const beforeEdit1 = await count()
  expect((await label()) === "v1", "initial label", await label())

  // 1. Compatible view edit: count survives and still ticks once per interval.
  await Promise.all([
    page.waitForEvent("load"),
    Promise.resolve().then(() => writeTimer(timerSource("v2")))
  ])
  await page.waitForFunction(
    () => document.querySelector("[data-label]")?.textContent === "v2"
  )
  const afterEdit1 = await count()
  expect(afterEdit1 >= beforeEdit1, "count survived edit 1", {
    beforeEdit1,
    afterEdit1
  })

  // Measure ticks over 350ms at 100ms interval -> should be 2-5 ticks (not doubled!).
  const t0 = await count()
  await page.waitForTimeout(350)
  const t1 = await count()
  const delta = t1 - t0
  expect(delta >= 2 && delta <= 5, "single timer interval after edit 1", {
    t0,
    t1,
    delta
  })

  // 2. Second compatible edit + broken module recovery: snapshot survives broken edit.
  const beforeBreak = await count()
  expectingError = true
  await Promise.all([
    page.waitForEvent("load"),
    Promise.resolve().then(() => writeTimer("export const Timer = (((broken"))
  ])
  await page.waitForTimeout(150)
  expectingError = false
  await Promise.all([
    page.waitForEvent("load"),
    Promise.resolve().then(() => writeTimer(timerSource("v2-fixed")))
  ])
  await page.waitForFunction(
    () => document.querySelector("[data-label]")?.textContent === "v2-fixed"
  )
  const afterFix = await count()
  expect(afterFix >= beforeBreak, "count survived broken module", {
    beforeBreak,
    afterFix
  })

  // 3. Incompatible Model edit: restarts from init with console warning.
  warnings.length = 0
  await Promise.all([
    page.waitForEvent("load"),
    Promise.resolve().then(() => writeTimer(incompatibleTimerSource))
  ])
  await page.waitForFunction(
    () => document.querySelector("[data-label]")?.textContent === "v3"
  )
  expect(
    (await page.locator("[data-count]").textContent()) === "reset",
    "incompatible edit reset to init",
    await page.locator("[data-count]").textContent()
  )
  expect(
    warnings.some((text) =>
      text.includes("/Timer restarted from init") &&
      text.includes("no longer decodes")
    ),
    "incompatible edit logged warning",
    warnings
  )

  // 4. Manual refresh after compatible edit starts fresh from init.
  await Promise.all([
    page.waitForEvent("load"),
    Promise.resolve().then(() => writeTimer(timerSource("v4")))
  ])
  await page.waitForFunction(
    () => Number(document.querySelector("[data-count]")?.textContent) >= 3
  )
  await page.reload()
  await page.waitForSelector("[data-count]")
  const afterManualReload = await count()
  expect(afterManualReload < 3, "manual reload started from init", {
    afterManualReload
  })

  await page.close()
} catch (error) {
  failures.push(String(error))
} finally {
  await browser.close()
  await server.close()
  fs.rmSync(root, { recursive: true, force: true })
}

for (const failure of failures) console.log(failure)
console.log(
  failures.length === 0
    ? "hot reload: ok"
    : "hot reload: " + failures.length + " failed"
)
process.exitCode = failures.length === 0 ? 0 : 1
