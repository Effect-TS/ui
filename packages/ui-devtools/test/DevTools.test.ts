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

const sized = (root: HTMLElement) => {
  const view = root.ownerDocument.defaultView!
  const prototype = view.HTMLElement.prototype
  const clientHeight = Object.getOwnPropertyDescriptor(prototype, "clientHeight") ??
    Object.getOwnPropertyDescriptor(view.Element.prototype, "clientHeight")
  const rect = view.Element.prototype.getBoundingClientRect
  const timeline = (element: Element) => element.matches(".timeline, .timeline > .rows")
  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return timeline(this) ? 2000 : clientHeight?.get?.call(this) ?? 0
    }
  })
  view.Element.prototype.getBoundingClientRect = function(this: Element) {
    return timeline(this) ? new view.DOMRect(0, 0, 340, 2000) : rect.call(this)
  }
}

const open = Effect.fnUntraced(function*(root: HTMLElement) {
  sized(root)
  HtmlLocator.click(HtmlLocator.getByRole(root, "button", { name: "Open the Effect UI inspector" }))
  for (let tries = 0; tries < 50 && root.querySelectorAll(".row").length <= 4; tries++) yield* settle
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
    kind: step.getAttribute("data-step")! +
      (step.hasAttribute("data-index") ? " " + step.getAttribute("data-index") : ""),
    what: text(step.querySelector(".what")),
    args: text(step.querySelector(".args"))
  }))

const step = (root: HTMLElement, kind: string, what?: RegExp) => {
  const found = steps(root).find((step) => step.kind === kind && (what === undefined || what.test(step.what)))
  assert.isDefined(
    found,
    "no chain step " + kind + " in " + JSON.stringify(steps(root).map((step) => step.kind + ": " + step.what))
  )
  return found!
}

const headline = (root: HTMLElement) => text(root.querySelector(".ehead .headline"))
const subtitle = (root: HTMLElement) => text(root.querySelector(".ehead .sub"))

const follow = (root: HTMLElement, kind: string, selector = "button.ref") =>
  click(step(root, kind).step.querySelector(selector)!)

const tab = (root: HTMLElement, name: RegExp) => click(HtmlLocator.getByRole(root, "tab", { name }))

const selectClickedSave = Effect.fnUntraced(function*(root: HTMLElement, pick = oldest) {
  yield* click(instance(root, "Editor[n2]"))
  yield* click(pick(root, /Update ClickedSave$/))
})

const commonChecks = Effect.fnUntraced(function*(root: HTMLElement) {
  const changed = root.querySelectorAll(".tree .tl[data-change=changed]")
  assert.strictEqual(changed.length, 1)
  assert.strictEqual(changed[0].querySelector(".k")?.textContent, "status")
  assert.strictEqual(changed[0].querySelector("del")?.textContent, "\"Dirty\"")
  assert.strictEqual(changed[0].querySelector("ins")?.textContent, "\"Saving\"")
  assert.include(text(HtmlLocator.getByRole(root, "tab", { name: /Model/ })), "1 change")

  yield* tab(root, /Raw/)
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
  yield* tab(root, /Model/)
})

const lifecycle = (root: HTMLElement, kind: string) =>
  Array.from(root.querySelectorAll(`.life tr[data-kind=${kind}] > *`)).map((cell) => text(cell))

describe("DevTools overlay", { concurrent: false }, () => {
  it.live("finds Editor[n2]'s Save, follows it to its interruption and back", () =>
    Effect.gen(function*() {
      const { memory, root } = yield* mount("interrupted")
      yield* open(root)

      assert.strictEqual(text(instance(root, "Editor[n1]")), "Editor[n1]1 ended")
      assert.strictEqual(text(instance(root, "Editor[n2]")), "Editor[n2]1 interrupted, unmounted")
      assert.isNotNull(instance(root, "Editor[n2]").querySelector(".status .tone-bad"))
      assert.isNull(instance(root, "Editor[n1]").querySelector(".status .tone-bad"))

      const rows = () => Array.from(root.querySelectorAll(".row")).map((row) => row.getAttribute("data-tag"))
      assert.notInclude(rows(), "SubscriptionStarted")
      assert.include(rows(), "CommandStarted")
      assert.include(rows(), "Update")
      assert.match(text(root.querySelector(".hidden-note")), /^\d+ lifecycle entries hidden\. Show them$/)
      yield* click(root.querySelector(".hidden-note button")!)
      assert.strictEqual(
        HtmlLocator.getByRole(root, "button", { name: "Everything" }).getAttribute("aria-pressed"),
        "true"
      )
      assert.include(rows(), "SubscriptionStarted")
      assert.isNull(root.querySelector(".hidden-note"))

      yield* selectClickedSave(root)
      yield* click(instance(root, "Editor[n2]"))
      assert.isFalse(instance(root, "Editor[n2]").classList.contains("on"))
      assert.strictEqual(instance(root, "Editor[n2]").getAttribute("aria-current"), "true")
      assert.isNull(instance(root, "Editor[n1]").getAttribute("aria-current"))
      yield* click(instance(root, "Editor[n2]"))
      assert.isTrue(instance(root, "Editor[n2]").classList.contains("on"))

      assert.strictEqual(headline(root), "ClickedSave")
      assert.match(subtitle(root), /^Update #\d+ on Editor\[n2\], \d+ ms after start$/)
      const chain = steps(root)
      assert.deepStrictEqual(chain.map((step) => step.kind), ["Source", "Entry", "Command 0", "Started", "End"])
      assert.strictEqual(chain[0].what, "\"click\" event")
      assert.strictEqual(chain[1].what, "ClickedSave this entry")
      assert.strictEqual(chain[2].what, "Issued notes/SaveNote")
      assert.strictEqual(chain[2].args, "{ noteId: \"n2\", text: \"Follow the command\", token: redacted }")
      assert.match(chain[3].what, /^Started #\d+$/)
      assert.match(chain[4].what, /^Interrupted after \d+ ms #\d+ by PressedEscape #\d+$/)
      assert.isTrue(chain[4].step.classList.contains("step-bad"))
      const clickedSave = subtitle(root)
      yield* commonChecks(root)

      yield* follow(root, "End", ".cause button.ref")
      assert.strictEqual(headline(root), "PressedEscape")
      assert.include(subtitle(root), "on Editor[n2]")
      assert.match(step(root, "Command 0").what, /^Interrupt notes\/SaveNote \{"noteId":"n2"\}, stopped #\d+$/)
      const source = step(root, "Source")
      assert.match(source.what, /^Subscription @effect\/ui\/html\/document \["keydown"\] #\d+$/)
      yield* click(source.step.querySelector("button.ref")!)
      assert.include(headline(root), "SubscriptionStarted")
      assert.include(subtitle(root), "on Editor[n2]")

      yield* click(instance(root, "Editor[n2]"))
      yield* click(HtmlLocator.getByRole(root, "button", { name: "Commands" }))
      yield* click(oldest(root, /notes\/SaveNote interrupted$/))
      assert.isTrue(step(root, "End").step.classList.contains("step-bad"))
      yield* follow(root, "Entry")
      assert.strictEqual(subtitle(root), clickedSave)

      yield* tab(root, /Lifecycle/)
      const [, path, mounted, unmounted] = lifecycle(root, "instance")
      assert.strictEqual(path, "/Workspace/Editor[n2]")
      assert.match(mounted, /^mounted #\d+$/)
      assert.match(unmounted, /^unmounted #\d+ by ClickedClose$/)
      assert.match(lifecycle(root, "command")[3], /^interrupted after \d+ ms #\d+$/)
      assert.match(lifecycle(root, "subscription")[3], /^closed by unmount #\d+$/)

      const count = text(root.querySelector(".bar .count"))
      const followLatest = HtmlLocator.getByRole(root, "button", { name: "Follow latest" })
      assert.strictEqual(followLatest.getAttribute("aria-pressed"), "false")
      yield* click(followLatest)
      assert.strictEqual(followLatest.getAttribute("aria-pressed"), "true")
      assert.strictEqual(headline(root), "Unmounted")
      assert.strictEqual(text(root.querySelector(".bar .count")), count)
      assert.notInclude(root.textContent, "DevToolsOverlay")
      assert.isFalse(memory.entries().some((entry) => "path" in entry && entry.path.includes("DevToolsOverlay")))
    }))

  it.live("reads the other captures as unmount, switch and still running", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("closed")
        yield* open(root)
        assert.strictEqual(text(instance(root, "Editor[n2]")), "Editor[n2]1 interrupted (unmount), unmounted")
        yield* selectClickedSave(root)
        assert.match(step(root, "End").what, /^Interrupted \(unmount\) after \d+ ms #\d+ by ClickedClose #\d+$/)
        yield* commonChecks(root)
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("switched")
        yield* open(root)
        assert.strictEqual(text(instance(root, "Editor[n2]")), "Editor[n2]1 interrupted (switch), 1 running")
        assert.isNotNull(instance(root, "Editor[n2]").querySelector(".status .tone-open"))
        yield* selectClickedSave(root)
        assert.match(step(root, "End").what, /^Interrupted \(switch\) after \d+ ms #\d+ by ClickedSave #\d+$/)
        yield* commonChecks(root)
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const { root } = yield* mount("open")
        yield* open(root)
        assert.strictEqual(text(instance(root, "Editor[n1]")), "Editor[n1]1 ended")
        assert.strictEqual(text(instance(root, "Editor[n2]")), "Editor[n2]1 running")
        const running = Array.from(root.querySelectorAll(".row")).filter((row) =>
          text(row.querySelector(".label")) === "notes/SaveNote running"
        )
        assert.strictEqual(running.length, 1)
        assert.strictEqual(text(running[0].querySelector(".mark")), "◌")
        yield* selectClickedSave(root)
        assert.match(step(root, "Started").what, /^Started #\d+$/)
        const end = step(root, "Running")
        assert.match(end.what, /^Still running since #\d+, no end logged yet$/)
        assert.isTrue(end.step.classList.contains("step-open"))
        assert.isFalse(steps(root).some((step) => step.kind === "End"))
        yield* commonChecks(root)
        yield* tab(root, /Lifecycle/)
        assert.strictEqual(lifecycle(root, "command")[3], "running")
        assert.notInclude(text(root.querySelector(".life")), "interrupt")
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
        update: { ClickedUpload: ($) => $.run(Upload.make()) },
        view: (h) => h.button.onClick(UploaderMessage.ClickedUpload()).children("Upload")
      })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: ($) => $.model,
        view: (h) => h.main(Uploader(h, { key: "uploader", props: {} }))
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

      assert.strictEqual(text(instance(root, "Uploader[uploader]")), "Uploader[uploader]1 failed, unmounted")
      yield* click(instance(root, "Uploader[uploader]"))
      yield* click(oldest(root, /Update ClickedUpload$/))
      const end = step(root, "End")
      assert.match(end.what, /^Failed in command( after \d+ ms)? #\d+, which failed its instance$/)
      assert.isTrue(end.step.classList.contains("step-bad"))
      assert.isFalse(steps(root).some((step) => step.kind === "Running"))
      yield* tab(root, /Lifecycle/)
      const run = lifecycle(root, "command")
      assert.strictEqual(run[1], "files/Upload")
      assert.match(run[2], /^issued #\d+, started #\d+$/)
      assert.match(run[3], /^failed( after \d+ ms)? #\d+$/)

      yield* follow(root, "End")
      assert.strictEqual(headline(root), "Failed command files/Upload")
      assert.isFalse(step(root, "End").step.classList.contains("step-this"))
      assert.strictEqual(step(root, "Entry").what.replace(/ #\d+$/, ""), "ClickedUpload")
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
          Escaped: ($) =>
            $.set($.model).run(Command.interrupt(Save, { id: "b" })).run(Command.interrupt(Save, { id: "a" })),
          Saved: ($) => $.model
        },
        view: (h) => h.button.onClick(Message.Escaped()).children("Escape")
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
      assert.strictEqual(step(root, "Entry").what, "Escaped this entry")
      const stopped = (kind: string) => step(root, kind).what.match(/stopped (#\d+)$/)?.[1]
      assert.isDefined(stopped("Command 0"))
      assert.isDefined(stopped("Command 1"))
      assert.notStrictEqual(stopped("Command 0"), stopped("Command 1"))
      yield* follow(root, "Command 0")
      assert.strictEqual(step(root, "Command 1").args, "{ id: \"b\" }")
      yield* click(oldest(root, /Update Escaped$/))
      yield* follow(root, "Command 1")
      assert.strictEqual(step(root, "Command 0").args, "{ id: \"a\" }")
    }))

  it.live("keeps a key pressed in the overlay from the app's document listeners", () =>
    Effect.gen(function*() {
      const { memory, root } = yield* mount("open")
      yield* open(root)
      yield* selectClickedSave(root)
      yield* tab(root, /Raw/)
      const copy = HtmlLocator.getByRole(root, "button", { name: "Copy frame" })
      copy.focus()
      const view = root.ownerDocument.defaultView!
      copy.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }))
      yield* wait(30)
      const interrupted = () => memory.entries().filter((entry) => entry._tag === "CommandInterrupted").length
      assert.strictEqual(interrupted(), 0)
      assert.include(text(instance(root, "Editor[n2]")), "1 running")

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      yield* wait(30)
      assert.strictEqual(interrupted(), 1)
    }))

  it.live("handles evicted entries in the causal chain and Model diff", () =>
    Effect.gen(function*() {
      const { root } = yield* mount("interrupted", 7)
      yield* open(root)
      yield* click(HtmlLocator.getByRole(root, "button", { name: "Commands" }))
      yield* click(entry(root, /notes\/SaveNote interrupted$/)[0]!)
      const issuedBy = step(root, "Link", /^Issued by/)
      assert.isNotNull(issuedBy.step.querySelector(".ref.outside"))
      assert.isNull(issuedBy.step.querySelector("button.ref"))
      yield* click(step(root, "Link", /^Caused by/).step.querySelector("button.ref")!)
      assert.strictEqual(headline(root), "PressedEscape")
      const saved = oldest(root, /Update SucceededSaveNote$/)
      yield* click(saved)
      assert.include(text(HtmlLocator.getByRole(root, "tab", { name: /Model/ })), "no diff")
      assert.match(text(root.querySelector(".pane.model .note")), /^Changed since #\d+, which is outside the buffer$/)
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
