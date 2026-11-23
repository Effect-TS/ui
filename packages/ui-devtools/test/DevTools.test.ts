// @vitest-environment happy-dom
import { Command, Component, MessageLog, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { type Capture, play } from "./fixtures/TwoEditors.ts"

const wait = (ms: number) => Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
const settle = wait(10)
const token = "tok_live_9f2c"

const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim()

const mount = Effect.fnUntraced(function*(capture: Capture) {
  const memory = MessageLog.makeMemory({ size: 500 })
  const services = yield* Layer.build(
    MessageLog.fanout([DevTools.layer(), Layer.succeed(MessageLog.MessageLog, memory)])
  )
  const app = yield* play(capture).pipe(Effect.provide(services))
  yield* settle
  const root = document.querySelector("[data-effect-ui-devtools]")!.shadowRoot!
  return { app, memory, root }
})

const open = Effect.fnUntraced(function*(root: ShadowRoot) {
  HtmlLocator.click(HtmlLocator.getByRole(root, "button", { name: "Open the Effect UI inspector" }))
  yield* settle
})

const click = Effect.fnUntraced(function*(element: Element) {
  HtmlLocator.click(element)
  yield* settle
})

const instance = (root: ShadowRoot, name: string) => root.querySelector(`[data-instance="${name}"]`)!

const entry = (root: ShadowRoot, name: RegExp) => {
  const found = HtmlLocator.queryAllByRole(root, "button", { name }).filter((node) =>
    node.classList.contains("row-button")
  )
  assert.isAbove(found.length, 0, "no timeline entry named " + name)
  return found
}

const oldest = (root: ShadowRoot, name: RegExp) => entry(root, name).at(-1)!

const steps = (root: ShadowRoot) =>
  Array.from(root.querySelectorAll(".chain .step")).map((step) => ({
    step,
    what: text(step.querySelector(".what")),
    body: text(step.querySelector(".step-body")),
    meta: text(step.querySelector(".meta"))
  }))

const step = (root: ShadowRoot, what: string) => {
  const found = steps(root).find((step) => step.what === what)
  assert.isDefined(found, "no chain step " + what + " in " + JSON.stringify(steps(root).map((step) => step.what)))
  return found!
}

const heading = (root: ShadowRoot) =>
  Array.from(root.querySelectorAll(".ehead > span")).map((node) => text(node)).filter((part) => part !== "").join(" ")

const follow = (root: ShadowRoot, what: string) => click(step(root, what).step.querySelector("button.ref")!)

const selectClickedSave = Effect.fnUntraced(function*(root: ShadowRoot, pick = oldest) {
  yield* click(instance(root, "Editor[n2]"))
  yield* click(pick(root, /Update ClickedSave$/))
})

const commonChecks = Effect.fnUntraced(function*(root: ShadowRoot) {
  const changed = root.querySelector(".tree .tl[data-change=changed]")
  assert.strictEqual(changed?.querySelector(".g")?.textContent, "~")
  assert.strictEqual(changed?.querySelector(".t-key")?.textContent, "status: ")
  assert.strictEqual(changed?.querySelector(".badge")?.textContent, "changed")
  assert.strictEqual(changed?.querySelector("del")?.textContent, "\"Dirty\"")
  assert.strictEqual(changed?.querySelector("ins")?.textContent, "\"Saving\"")

  HtmlLocator.click(HtmlLocator.getByRole(root, "tab", { name: /Raw frame/ }))
  yield* settle
  const copied: Array<string> = []
  Object.defineProperty(globalThis.navigator, "clipboard", {
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

  it.live("reads Editor[n2]'s Save as interrupted by its unmount when it's closed mid-save", () =>
    Effect.gen(function*() {
      const { root } = yield* mount("closed")
      yield* open(root)
      assert.include(text(instance(root, "Editor[n2]")), "× 1 interrupted · unmount")
      yield* selectClickedSave(root)
      assert.include(step(root, "end").body, "CommandInterrupted reason unmount")
      assert.include(step(root, "causedBy").body, "Update ClickedClose")
      yield* commonChecks(root)
    }))

  it.live("reads Editor[n2]'s first Save as switched out by the second", () =>
    Effect.gen(function*() {
      const { root } = yield* mount("switched")
      yield* open(root)
      assert.include(text(instance(root, "Editor[n2]")), "× 1 interrupted · switch")
      assert.include(text(instance(root, "Editor[n2]")), "◌ 1 running")
      yield* selectClickedSave(root)
      assert.include(step(root, "end").body, "CommandInterrupted reason switch")
      assert.include(step(root, "causedBy").body, "Update ClickedSave")
      yield* commonChecks(root)
    }))

  it.live("reads a hanging save as running since its CommandStarted, with no end", () =>
    Effect.gen(function*() {
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
      const root = document.querySelector("[data-effect-ui-devtools]")!.shadowRoot!
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
    }).pipe(Effect.scoped))

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
