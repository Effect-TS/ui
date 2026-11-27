import * as fs from "node:fs"
import * as path from "node:path"
import { DevToolsVite } from "../../src/node/index.ts"
import { run } from "./run.mts"

const repo = path.resolve(import.meta.dirname, "../../../..")
const root = fs.mkdtempSync(path.join(import.meta.dirname, ".workbench-tmp-"))

const write = (name, source) => {
  const full = path.join(root, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, source, "utf8")
}

write("src/styles.css", "[data-todo] { color: rgb(1, 2, 3); }\n")

write(
  "src/TodoItem.ts",
  `import { Command, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const TodoMessage = UiSchema.TaggedEnum({
  ClickedSave: {},
  CompletedSaveTodo: {},
  ClickedFinish: {}
})

export class SaveTodo extends Command.Service<SaveTodo>()(
  "todos/SaveTodo",
  { args: { id: Schema.String }, success: TodoMessage }
) {}

export const TodoItem = Html.component({
  name: "TodoItem",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ saved: Schema.Boolean }),
  message: TodoMessage
}).make({
  init: () => ({ saved: false }),
  update: ($, message) =>
    TodoMessage.match(message, {
      ClickedSave: () => $.run(SaveTodo.make({ id: $.props.id })),
      CompletedSaveTodo: () => ({ saved: true }),
      ClickedFinish: () => $.evolve({ saved: true }).viewTransition()
    }),
  view: (h, model) =>
    h.button.attr("data-todo", h.props.id).on("click", TodoMessage.ClickedSave())
      .children(
        model.saved ? "saved" : h.isRunning(SaveTodo) ? "saving" : "save"
      )
})
`
)

write(
  "src/TodoItem.cases.ts",
  `import { Case } from "@effect/ui/testing"
import { Effect } from "effect"
import { SaveTodo, TodoItem, TodoMessage } from "./TodoItem.ts"

const SavePending = SaveTodo.toLayer(() => Effect.never)

export const TodoItemCases = Case.make(TodoItem, {
  saving: {
    props: { id: "t1" },
    messages: [TodoMessage.ClickedSave()],
    layer: SavePending
  },
  saved: {
    props: { id: "t1" },
    model: { saved: true },
    layer: SavePending
  },
  "a?b#1": {
    props: { id: "t1" },
    model: { saved: true },
    layer: SavePending
  },
  finished: {
    props: { id: "t1" },
    messages: [TodoMessage.ClickedFinish()],
    layer: SavePending
  }
})
`
)

write(
  "src/Broken.cases.ts",
  `throw new Error("broken case module")\n`
)

try {
  await run("workbench", async ({ browser, expect, failures, url }) => {
    const page = await browser.newPage()
    const sockets = []
    page.on("websocket", (ws) => {
      if (ws.url().includes(":47771/")) sockets.push(ws)
    })
    page.on("pageerror", (error) => {
      failures.push("pageerror: " + String(error))
    })

    const waitReady = () =>
      page.waitForFunction(() => {
        const container = document.getElementById("root")
        return container !== null && Object.keys(container.dataset).length > 0
      })

    await page.goto(url + "__workbench/TodoItem/saved")
    await waitReady()
    const savedText = await page.locator("[data-todo=\"t1\"]").textContent()
    expect(savedText === "saved", "saved case renders saved state", savedText)
    const color = await page.locator("[data-todo=\"t1\"]").evaluate((el) =>
      getComputedStyle(el).color
    )
    expect(color === "rgb(1, 2, 3)", "setup stylesheet applied", color)
    const overlayCount = await page.locator("iframe[data-effect-ui-devtools]")
      .count()
    expect(overlayCount === 1, "overlay mounts by default", overlayCount)

    sockets.length = 0
    await page.goto(url + "__workbench/TodoItem/saved?bare")
    await waitReady()
    await page.waitForTimeout(150)
    const bareFrames = await page.locator("iframe[data-effect-ui-devtools]")
      .count()
    const logConnected = sockets.some((ws) => ws.url().endsWith("/log"))
    expect(
      bareFrames === 0 && logConnected,
      "?bare omits overlay iframe and keeps server socket",
      { bareFrames, logConnected }
    )

    await page.goto(url + "__workbench/TodoItem/saving")
    await waitReady()
    const savingText = await page.locator("[data-todo=\"t1\"]").textContent()
    expect(
      savingText === "saving",
      "saving case replays messages with pending layer without blocking ready",
      savingText
    )

    await page.goto(url + "__workbench/")
    await page.locator("a", { hasText: "TodoItem/a?b#1" }).click()
    await waitReady()
    const hashPath = await page.evaluate(() => location.pathname)
    expect(
      hashPath === "/app/__workbench/TodoItem/a%3Fb%231",
      "a key with ? and # links to its own case",
      hashPath
    )

    await page.goto(url + "__workbench/TodoItem/missing")
    await page.locator("a", { hasText: "TodoItem/saved" }).waitFor()
    const missingBody = await page.locator("body").textContent()
    expect(
      /not found|unknown/i.test(missingBody ?? ""),
      "unknown case shows not-found note alongside case list",
      missingBody?.slice(0, 200)
    )

    await page.close()

    // The marker waits for the commit a held view transition defers.
    const held = await browser.newPage()
    held.on("pageerror", (error) => {
      failures.push("pageerror: " + String(error))
    })
    await held.addInitScript(() => {
      document.startViewTransition = (update) => {
        window.__release = typeof update === "function" ? update : update.update
        const done = Promise.resolve()
        return {
          ready: done,
          finished: done,
          updateCallbackDone: done,
          skipTransition: () => {}
        }
      }
    })
    await held.goto(url + "__workbench/TodoItem/finished?bare")
    await held.waitForFunction(() => window.__release !== undefined)
    await held.waitForTimeout(150)
    const early = await held.evaluate(() => ({
      ready: document.getElementById("root").hasAttribute(
        "data-workbench-ready"
      ),
      text: document.querySelector("[data-todo]")?.textContent
    }))
    expect(
      !early.ready && early.text === "save",
      "no ready marker while a view transition holds the commit",
      early
    )
    await held.evaluate(() => window.__release())
    await held.waitForFunction(() =>
      document.getElementById("root").hasAttribute("data-workbench-ready")
    )
    const finishedText = await held.locator("[data-todo=\"t1\"]").textContent()
    expect(
      finishedText === "saved",
      "ready marker follows the transition's commit",
      finishedText
    )
    await held.close()
  }, {
    root,
    // Vite doesn't prefix the plugin's own URLs and tags with `base`.
    base: "/app/",
    plugins: [
      DevToolsVite.plugin({
        port: 47771,
        workbench: {
          cases: "/src/**/*.cases.ts",
          setup: "/src/styles.css"
        }
      })
    ],
    server: { fs: { allow: [root, repo] } }
  })
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
