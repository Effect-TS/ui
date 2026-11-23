// @vitest-environment happy-dom
import { Command, Component, MessageLog, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import * as DevToolsLayer from "@effect/ui-devtools/internal/layer"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { type Capture, play } from "./fixtures/TwoEditors.ts"

const wait = (ms: number) => Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
const settle = wait(10)
const token = "tok_live_9f2c"

const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim()

const overlay = () =>
  document.querySelector<HTMLIFrameElement>("iframe[data-effect-ui-devtools]")!.contentDocument!.body

const mount = Effect.fnUntraced(function*(capture: Capture, buffer?: number) {
  const memory = MessageLog.makeMemory({ size: 500 })
  const services = yield* Layer.build(
    MessageLog.fanout([
      buffer === undefined ? DevTools.layer() : DevToolsLayer.make({ buffer }),
      Layer.succeed(MessageLog.MessageLog, memory)
    ])
  )
  const app = yield* play(capture).pipe(Effect.provide(services))
  yield* settle
  return { app, memory, root: overlay() }
})

const open = Effect.fnUntraced(function*(root: HTMLElement) {
  HtmlLocator.click(HtmlLocator.getByRole(root, "button", { name: "Open the Effect UI inspector" }))
  yield* settle
})

const click = Effect.fnUntraced(function*(element: Element) {
  HtmlLocator.click(element)
  yield* settle
})

const instance = (root: HTMLElement, name: string) => root.querySelector(`[data-instance="${name}"]`)!

const entry = (root: HTMLElement, name: RegExp) => {
  const found = HtmlLocator.queryAllByRole(root, "button", { name }).filter((node) =>
    node.classList.contains("row-button")
  )
  assert.isAbove(found.length, 0, "no timeline entry named " + name)
  return found
}

const oldest = (root: HTMLElement, name: RegExp) => entry(root, name).at(-1)!

const steps = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".chain .step")).map((step) => ({
    step,
    what: text(step.querySelector(".what")),
    body: text(step.querySelector(".step-body")),
    meta: text(step.querySelector(".meta"))
  }))

const step = (root: HTMLElement, what: string) => {
  const found = steps(root).find((step) => step.what === what)
  assert.isDefined(found, "no chain step " + what + " in " + JSON.stringify(steps(root).map((step) => step.what)))
  return found!
}

const heading = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".ehead > span")).map((node) => text(node)).filter((part) => part !== "").join(" ")

const follow = (root: HTMLElement, what: string) => click(step(root, what).step.querySelector("button.ref")!)

const selectClickedSave = Effect.fnUntraced(function*(root: HTMLElement, pick = oldest) {
  yield* click(instance(root, "Editor[n2]"))
  yield* click(pick(root, /Update ClickedSave$/))
})

const commonChecks = Effect.fnUntraced(function*(root: HTMLElement) {
  const changed = root.querySelector(".tree .tl[data-change=changed]")
  assert.strictEqual(changed?.querySelector(".g")?.textContent, "~")
  assert.strictEqual(changed?.querySelector(".t-key")?.textContent, "status: ")
  assert.strictEqual(changed?.querySelector(".badge")?.textContent, "changed")
  assert.strictEqual(changed?.querySelector("del")?.textContent, "\"Dirty\"")
  assert.strictEqual(changed?.querySelector("ins")?.textContent, "\"Saving\"")

  HtmlLocator.click(HtmlLocator.getByRole(root, "tab", { name: /Raw frame/ }))
  yield* settle
  const copied: Array<string> = []
  Object.defineProperty(root.ownerDocument.defaultView!.navigator, "clipboard", {
    configurable: true,
    value: { writeText: (value: string) => Promise.resolve(void copied.push(value)) }
  })
  yield* click(HtmlLocator.getByRole(root, "button", { name: "Copy frame" }))
  assert.strictEqual(copied.length, 1)
  assert.include(copied[0], "\"~redacted\": true")
  assert.notInclude(copied[0], token)
  assert.include(text(root.querySelector(".raw")), "\"~redacted\": true")
  assert.notInclude(root.textContent, token)
})

describe("DevTools overlay", { concurrent: false }, () => {
  it.live("finds Editor[n2]'s Save, follows it to its interruption and back", () =>
    Effect.gen(function*() {
      const { memory, root } = yield* mount("interrupted")
      yield* open(root)

      assert.include(text(instance(root, "Editor[n1]")), "✓ 1 command ended")
      assert.notInclude(text(instance(root, "Editor[n1]")), "interrupted")
      assert.include(text(instance(root, "Editor[n2]")), "× 1 interrupted")
      assert.notInclude(text(instance(root, "Editor[n2]")), "ended")

      yield* selectClickedSave(root)
      yield* click(instance(root, "Editor[n2]"))
      assert.isFalse(instance(root, "Editor[n2]").classList.contains("on"))
      assert.strictEqual(instance(root, "Editor[n2]").getAttribute("aria-current"), "true")
      assert.isNull(instance(root, "Editor[n1]").getAttribute("aria-current"))
      yield* click(instance(root, "Editor[n2]"))
      assert.isTrue(instance(root, "Editor[n2]").classList.contains("on"))
      const chain = steps(root)
      assert.deepStrictEqual(chain.map((step) => step.what), [
        "source",
        "Update",
        "issued command 0",
        "started",
        "end",
        "causedBy"
      ])
      assert.strictEqual(chain[0].body, "DomEvent \"click\"")
      assert.include(chain[1].body, "Update ClickedSave")
      assert.include(chain[1].body, "THIS ENTRY")
      assert.include(chain[1].meta, "Editor[n2]")
      assert.match(chain[2].body, /^notes\/SaveNote .* group {"noteId":"n2"}$/)
      assert.match(chain[3].body, /CommandStarted span [0-9a-f]+$/)
      assert.include(chain[4].body, "CommandInterrupted reason interrupt")
      const clickedSave = heading(root)
      yield* commonChecks(root)

      yield* follow(root, "causedBy")
      assert.include(heading(root), "Update")
      assert.include(heading(root), "PressedEscape")
      assert.include(heading(root), "/Workspace/Editor[n2]")
      const escape = step(root, "command 0")
      assert.strictEqual(escape.body, "Interrupt notes/SaveNote group {\"noteId\":\"n2\"}")
      assert.match(escape.meta, /^stopped #\d+$/)
      const source = step(root, "source")
      assert.strictEqual(source.body, "Subscription @effect/ui/html/document [\"keydown\"]")
      assert.match(source.meta, /^started #\d+ on this instance$/)
      yield* click(source.step.querySelector("button.ref")!)
      assert.include(heading(root), "SubscriptionStarted")
      assert.include(heading(root), "/Workspace/Editor[n2]")

      yield* click(instance(root, "Editor[n2]"))
      yield* click(HtmlLocator.getByRole(root, "button", { name: "Commands" }))
      yield* click(oldest(root, /CommandInterrupted notes\/SaveNote · interrupt$/))
      assert.include(step(root, "end").body, "reason interrupt")
      assert.isTrue(step(root, "end").step.classList.contains("stop"))
      yield* follow(root, "Update")
      assert.strictEqual(heading(root), clickedSave)

      const lifecycle = text(root.querySelector(".lifecycle"))
      assert.include(lifecycle, "Lifecycle of Editor[n2]")
      assert.include(lifecycle, "⏏ unmounted")
      assert.include(lifecycle, "× interrupt")
      assert.include(lifecycle, "■ closed by Unmounted")

      const count = text(root.querySelector(".bar"))
      yield* click(HtmlLocator.getByRole(root, "button", { name: "Follow latest →" }))
      assert.include(heading(root), "Unmounted")
      assert.strictEqual(
        text(root.querySelector(".bar")).replace(/Inspecting #\d+/, ""),
        count.replace(/Inspecting #\d+/, "")
      )
      assert.notInclude(root.textContent, "DevToolsOverlay")
      assert.isFalse(memory.entries().some((entry) => "path" in entry && entry.path.includes("DevToolsOverlay")))
    }))

  it.live("reads the other captures as unmount, switch and still running", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("closed")
        yield* open(root)
        assert.include(text(instance(root, "Editor[n2]")), "× 1 interrupted · unmount")
        yield* selectClickedSave(root)
        assert.include(step(root, "end").body, "CommandInterrupted reason unmount")
        assert.include(step(root, "causedBy").body, "Update ClickedClose")
        yield* commonChecks(root)
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("switched")
        yield* open(root)
        assert.include(text(instance(root, "Editor[n2]")), "× 1 interrupted · switch")
        assert.include(text(instance(root, "Editor[n2]")), "◌ 1 running")
        yield* selectClickedSave(root)
        assert.include(step(root, "end").body, "CommandInterrupted reason switch")
        assert.include(step(root, "causedBy").body, "Update ClickedSave")
        yield* commonChecks(root)
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("open")
        yield* open(root)
        assert.include(text(instance(root, "Editor[n1]")), "✓ 1 command ended")
        assert.include(text(instance(root, "Editor[n2]")), "◌ 1 running")
        yield* selectClickedSave(root)
        assert.match(step(root, "started").body, /CommandStarted span [0-9a-f]+$/)
        const end = step(root, "end")
        assert.match(end.body, /^running since #\d+ · no end observed$/)
        assert.isTrue(end.step.classList.contains("open"))
        assert.isFalse(steps(root).some((step) => step.what === "causedBy"))
        assert.include(text(root.querySelector(".lifecycle")), "◌ running · no end observed")
        assert.notInclude(text(root.querySelector(".lifecycle")), "interrupt")
        yield* commonChecks(root)
      }))
    }))

  it.live("reads a run whose defect failed its instance as failed, not running", () =>
    Effect.gen(function*() {
      const Upload = Command.make("files/Upload", { args: {} }, () => Effect.die("disk full"))
      const UploaderMessage = UiSchema.TaggedEnum({ ClickedUpload: {} })
      const Uploader = Component.define({
        name: "Uploader",
        scoped: false,
        model: Schema.Struct({}),
        message: UploaderMessage,
        elements: Html
      }).make({
        init: () => ({}),
        update: { ClickedUpload: (_model, _message, $) => $.run(Upload.make()) },
        view: (_model, h) => h.button.onClick(UploaderMessage.ClickedUpload()).children("Upload")
      })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_model, h) => h.main(Uploader(h, { key: "uploader", props: {} }))
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      yield* Layer.build(DevTools.layer()).pipe(
        Effect.flatMap((services) => BrowserHost.mountEffect(Page, {}, app).pipe(Effect.provide(services)))
      )
      yield* settle
      HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Upload" }))
      yield* wait(30)
      const root = overlay()
      yield* open(root)

      const uploader = text(instance(root, "Uploader[uploader]"))
      assert.include(uploader, "× 1 failed")
      assert.notInclude(uploader, "running")
      yield* click(instance(root, "Uploader[uploader]"))
      yield* click(oldest(root, /Update ClickedUpload$/))
      const end = step(root, "end")
      assert.match(end.body, /^#\d+ Failed in command · the run failed its instance · \d+ms after issue$/)
      assert.isTrue(end.step.classList.contains("stop"))
      assert.isFalse(steps(root).some((step) => step.body.includes("no end observed")))
      const run = Array.from(root.querySelectorAll(".lifecycle tr[data-kind=command] > *")).map((cell) => text(cell))
      assert.strictEqual(run[1], "files/Upload")
      assert.match(run[2], /^issued #\d+ · started #\d+$/)
      assert.match(run[3], /^× failed #\d+ after \d+ms$/)

      yield* follow(root, "end")
      assert.include(heading(root), "Failed")
      assert.strictEqual(step(root, "end").step.classList.contains("this"), false)
      assert.include(step(root, "Update").body, "Update ClickedUpload")
    }))

  it.live("credits each interrupt with the run of its own group", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Escaped: {}, Saved: {} })
      const Save = Command.make("test/Save", { args: { id: Schema.String }, group: ["id"] }, () => Effect.never)
      const save = (id: string) => Save.make({ id }).pipe(Command.map(() => Message.Saved()))
      const Editor = Component.define({
        name: "Editor",
        scoped: false,
        model: Schema.Null,
        message: Message,
        elements: Html
      }).make({
        init: ($) => $.set(null).run(save("a")).run(save("b")),
        update: {
          Escaped: (model, _message, $) =>
            $.set(model).run(Command.interrupt(Save, { id: "b" })).run(Command.interrupt(Save, { id: "a" })),
          Saved: (model) => model
        },
        view: (_, h) => h.button.onClick(Message.Escaped()).children("Escape")
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      yield* Layer.build(DevTools.layer()).pipe(
        Effect.flatMap((services) => BrowserHost.mountEffect(Editor, {}, app).pipe(Effect.provide(services)))
      )
      yield* settle
      yield* click(HtmlLocator.getByRole(app, "button", { name: "Escape" }))
      const root = overlay()
      yield* open(root)
      yield* click(oldest(root, /Update Escaped$/))
      assert.notInclude(step(root, "Update").meta, "stopped ")
      assert.match(step(root, "command 0").meta, /^stopped #\d+$/)
      assert.match(step(root, "command 1").meta, /^stopped #\d+$/)
      yield* follow(root, "command 0")
      assert.include(step(root, "issued command 1").body, "{\"id\":\"b\"}")
    }))

  it.live("keeps a key pressed in the overlay from the app's document listeners", () =>
    Effect.gen(function*() {
      const { memory, root } = yield* mount("open")
      yield* open(root)
      yield* selectClickedSave(root)
      yield* click(HtmlLocator.getByRole(root, "tab", { name: /Raw frame/ }))
      const copy = HtmlLocator.getByRole(root, "button", { name: "Copy frame" })
      copy.focus()
      const view = root.ownerDocument.defaultView!
      copy.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }))
      yield* wait(30)
      const interrupted = () => memory.entries().filter((entry) => entry._tag === "CommandInterrupted").length
      assert.strictEqual(interrupted(), 0)
      assert.include(text(instance(root, "Editor[n2]")), "◌ 1 running")

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      yield* wait(30)
      assert.strictEqual(interrupted(), 1)
    }))

  it.live("handles evicted entries in the causal chain and Model diff", () =>
    Effect.gen(function*() {
      const { root } = yield* mount("interrupted", 6)
      yield* open(root)
      yield* click(HtmlLocator.getByRole(root, "button", { name: "Commands" }))
      yield* click(entry(root, /CommandInterrupted notes\/SaveNote · interrupt$/)[0]!)
      const issuedBy = step(root, "issued by")
      assert.isNotNull(issuedBy.step.querySelector(".ref.outside"))
      assert.isNull(issuedBy.step.querySelector("button.ref"))
      yield* follow(root, "causedBy")
      assert.include(heading(root), "PressedEscape")
      assert.include(text(HtmlLocator.getByRole(root, "tab", { name: /Model/ })), "diff unavailable")
      assert.match(
        text(root.querySelector(".pane.model h4")),
        /diff unavailable: this instance's previous entry #\d+ is outside the buffer/
      )
      assert.isNull(root.querySelector(".tree .tl[data-change]"))
    }))

  it.live("leaves the app's Model and DOM as they are", () =>
    Effect.gen(function*() {
      const models = (entries: ReadonlyArray<MessageLog.Wire>) => {
        const paths: { [path: string]: Array<unknown> } = {}
        for (const entry of entries) {
          if (entry._tag === "Update") (paths[entry.path] ??= []).push([entry.message, entry.model])
        }
        return paths
      }
      const encoder = MessageLog.makeEncoder()
      for (const capture of ["interrupted", "open", "closed", "switched"] as const) {
        const without = yield* Effect.scoped(Effect.gen(function*() {
          const memory = MessageLog.makeMemory({ size: 500 })
          const app = yield* play(capture).pipe(Effect.provideService(MessageLog.MessageLog, memory))
          return { html: app.innerHTML, models: models(memory.entries().map((entry) => encoder.encode(entry))) }
        }))
        const within = yield* Effect.scoped(Effect.gen(function*() {
          const { app, memory } = yield* mount(capture)
          return { html: app.innerHTML, models: models(memory.entries().map((entry) => encoder.encode(entry))) }
        }))
        assert.strictEqual(within.html, without.html)
        assert.deepStrictEqual(within.models, without.models)
        assert.isNull(document.querySelector("[data-effect-ui-devtools]"))
      }
    }))
})
