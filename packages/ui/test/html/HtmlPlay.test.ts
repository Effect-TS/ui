// @vitest-environment happy-dom
import { type Component, Subscription } from "@effect/ui"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import {
  HtmlLocator,
  HtmlPlay,
  TestGlobalEvents
} from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Clock,
  Duration,
  Effect,
  Exit,
  Layer,
  Schema,
  type Scope,
  Stream
} from "effect"
import { TestClock } from "effect/testing"
import { Menu } from "./fixtures/headless.ts"
import { Settings } from "./fixtures/settings.ts"

const Checkout = Html.component({
  name: "Checkout",
  model: Schema.Struct({
    log: Schema.Array(Schema.String),
    zip: Schema.String
  }),
  message: Schema.String
}).make({
  init: () => ({ log: [], zip: "old" }),
  update: ($, message) => ({
    log: [...$.model.log, message],
    zip: message === "fill" ? "new" : $.model.zip
  }),
  view: (h, model) =>
    h.div(
      h.form.onFocus("form focus").onSubmit(({ entries }) =>
        `submit:${entries.map(([name, value]) => `${name}=${value}`).join("&")}`
      )
        .children(
          h.input.attr("name", "zip").attr("aria-label", "Zip").value(model.zip)
            .onInput(() => undefined),
          h.input.attr("name", "note").attr("aria-label", "Note").onInput((
            { value }
          ) => `note:${value}`),
          h.input.attr("type", "radio").attr("name", "size").attr("value", "s")
            .attr("aria-label", "S").attr(
              "checked",
              ""
            ),
          h.input.attr("type", "radio").attr("name", "size").attr("value", "m")
            .attr("aria-label", "M")
            .onChange(({ value }) => `size:${value}`),
          h.button.onClick("fill").children("Fill"),
          h.button.onClick("stopped", { preventDefault: true }).children("Stop")
        ),
      h.output(model.log.join("|"))
    )
})

const log = Locator.tag("output")

const frame = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

const inBrowser = Effect.fnUntraced(function*(
  component: Component.Any,
  act: (app: HTMLElement) => void | Promise<void>
) {
  const app = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  yield* BrowserHost.mountEffect(component as typeof Settings, {}, app)
  yield* Effect.promise(async () => act(app))
  yield* Effect.promise(frame)
  return app.querySelector("output")!.textContent
}, Effect.scoped)

const play = <A, E>(
  test: Effect.Effect<A, E, TestHost.TestHost | Scope.Scope>
) => test.pipe(Effect.scoped, Effect.provide(TestHost.layer()))

describe("HtmlPlay", () => {
  it.effect("type, keydown and a click's defaults send what BrowserHost sends", () =>
    Effect.gen(function*() {
      const browser = yield* inBrowser(Settings, (app) => {
        const zip = HtmlLocator.getByRole(app, "textbox", {
          name: "Zip code"
        }) as HTMLInputElement
        HtmlLocator.type(zip, "10001")
        zip.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            shiftKey: true,
            bubbles: true
          })
        )
        HtmlLocator.click(
          HtmlLocator.getByRole(app, "checkbox", { name: "Agree" })
        )
        HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Go" }))
      })
      yield* play(Effect.gen(function*() {
        const settings = yield* HtmlPlay.make(Settings, {})
        yield* settings.type(HtmlLocator.label("Zip code"), "10001")
        yield* settings.keydown(HtmlLocator.label("Zip code"), "Enter", {
          shift: true
        })
        yield* settings.click(HtmlLocator.role("checkbox", { name: "Agree" }))
        yield* settings.expect(HtmlLocator.label("Agree")).toBeChecked()
        yield* settings.click(HtmlLocator.role("button", { name: "Go" }))
        yield* settings.expect(log).toHaveText(browser!)
        yield* settings.click("Menu")
        yield* settings.click("Menu")
        yield* settings.expect(log).toHaveText(
          `${browser}|toggle:open|toggle:closed`
        )
      }))
      assert.strictEqual(
        browser,
        "zip:10001|key:Enter+shift|agree:true|submit:zip=10001&agree=on&via=go"
      )
    }))

  it.effect("a submit reads the fields as they were before the click's own message, and keeps what was entered", () =>
    Effect.gen(function*() {
      const browser = yield* inBrowser(Checkout, async (app) => {
        const zip = HtmlLocator.getByRole(app, "textbox", {
          name: "Zip"
        }) as HTMLInputElement
        HtmlLocator.type(zip, "rejected")
        const note = HtmlLocator.getByRole(app, "textbox", {
          name: "Note"
        }) as HTMLInputElement
        note.focus()
        await frame()
        assert.strictEqual(zip.value, "old")
        HtmlLocator.type(note, "hi")
        HtmlLocator.click(HtmlLocator.getByRole(app, "radio", { name: "M" }))
        HtmlLocator.click(
          HtmlLocator.getByRole(app, "button", { name: "Stop" })
        )
        HtmlLocator.click(
          HtmlLocator.getByRole(app, "button", { name: "Fill" })
        )
      })
      yield* play(Effect.gen(function*() {
        const checkout = yield* HtmlPlay.make(Checkout, {})
        yield* checkout.type(HtmlLocator.label("Zip"), "rejected")
        yield* checkout.expectIgnored()
        yield* checkout.expect(HtmlLocator.label("Zip")).toHaveValue("old")
        const focus = yield* Effect.exit(
          checkout.focus(HtmlLocator.label("Note"))
        )
        assert.match(
          Exit.isFailure(focus) ? Cause.pretty(focus.cause) : "",
          /nothing handles "focus"/
        )
        yield* checkout.type(HtmlLocator.label("Note"), "hi")
        yield* checkout.click(HtmlLocator.role("radio", { name: "M" }))
        yield* checkout.click("Stop")
        yield* checkout.click("Fill")
        yield* checkout.expect(log).toHaveText(browser!)
      }))
      assert.strictEqual(
        browser,
        "note:hi|size:m|stopped|fill|submit:zip=old&note=hi&size=m"
      )
    }))

  it.effect("a part's message counts as handled, and a key no part takes is ignored", () =>
    Effect.gen(function*() {
      const Toolbar = Html.component({
        name: "Toolbar",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            Menu(h, {
              props: { items: [] },
              view: (menu) =>
                h.div(
                  menu.trigger(h.button).children("Actions"),
                  h.p(menu.open ? "open" : "closed")
                )
            })
        })
      const toolbar = yield* HtmlPlay.make(Toolbar, {})
      yield* toolbar.keydown(Locator.text("Actions"), "Shift")
      yield* toolbar.expectIgnored()
      yield* toolbar.click("Actions")
      yield* toolbar.expect(Locator.tag("p")).toHaveText("open")
      const exit = yield* Effect.exit(toolbar.expectIgnored())
      assert.match(
        Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "",
        /produced a message/
      )
    }).pipe(play))

  it.effect("keydown resolves inherited editability and accepts full key details", () =>
    Effect.gen(function*() {
      const Keys = Html.component({
        name: "Keys",
        model: Schema.Array(Schema.String),
        message: Schema.String
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, entry) => [...$.model, entry],
        view: (h, entries) =>
          h.div.onKeyDown(({ editable, key, repeat }) =>
            `${key}:${editable}:${repeat}`
          ).children(
            h.div.prop("contentEditable", "true").children(
              h.span.attr("id", "play-ce-child").children("Edit")
            ),
            h.output(entries.join(","))
          )
      })
      const p = yield* HtmlPlay.make(Keys, {})
      yield* p.keydown(Locator.attr("id", "play-ce-child"), "g")
      yield* p.keydown(Locator.attr("id", "play-ce-child"), "g", {
        repeat: true,
        editable: false
      })
      yield* p.expect(log).toHaveText("g:true:false,g:false:true")
    }).pipe(play))

  it.effect("click sends pointerdown, mousedown, mouseup, click in order, settles between press and release, and follows browser cancel rules", () =>
    Effect.gen(function*() {
      const Sequence = Html.component({
        name: "Sequence",
        model: Schema.Struct({
          log: Schema.Array(Schema.String),
          pressed: Schema.Boolean,
          gone: Schema.Boolean,
          off: Schema.Boolean
        }),
        message: Schema.String
      }).make({
        init: () => ({ log: [], pressed: false, gone: false, off: false }),
        update: ($, message) => ({
          log: [...$.model.log, message],
          pressed: $.model.pressed || message === "md",
          gone: $.model.gone || message === "remove-down",
          off: $.model.off || message === "disable-down"
        }),
        view: (h, model) =>
          h.div(
            h.form.onSubmit("submit").children(
              h.button.on("pointerdown", "pd")
                .on("mousedown", "md")
                .on("mouseup", "mu")
                .onClick(model.pressed ? "ck-down" : "ck-up")
                .children(model.pressed ? "AllDown" : "All"),
              h.button.on("pointerdown", "pd-cancel", { preventDefault: true })
                .on("mousedown", "md")
                .on("mouseup", "mu")
                .onClick("ck")
                .children("CancelPD"),
              h.button.on("pointerdown", "pd")
                .on("mousedown", "md-cancel", { preventDefault: "always" })
                .on("mouseup", "mu-cancel", { preventDefault: "always" })
                .onClick("ck")
                .children("CancelMouse")
            ),
            model.gone
              ? undefined
              : h.div(
                h.button.attr("type", "button")
                  .on("mousedown", "remove-down")
                  .on("mouseup", "remove-up")
                  .onClick("remove-click")
                  .children("Remove")
              ),
            h.button.attr("type", "button")
              .disabled(model.off)
              .on("mousedown", "disable-down")
              .on("mouseup", "disable-up")
              .onClick("disable-click")
              .children("Disable"),
            h.span("Unhandled"),
            h.output(model.log.join("|"))
          )
      })
      const p = yield* HtmlPlay.make(Sequence, {})
      yield* p.click("All")
      yield* p.expect(log).toHaveText("pd|md|mu|ck-down|submit")
      yield* p.click("CancelPD")
      yield* p.expect(log).toHaveText(
        "pd|md|mu|ck-down|submit|pd-cancel|ck|submit"
      )
      yield* p.click("CancelMouse")
      yield* p.expect(log).toHaveText(
        "pd|md|mu|ck-down|submit|pd-cancel|ck|submit|pd|md-cancel|mu-cancel|ck|submit"
      )
      yield* p.click("Remove")
      yield* p.expect(log).toHaveText(/\|remove-down$/)
      yield* p.click("Disable")
      yield* p.expect(log).toHaveText(/\|disable-down$/)
      const exit = yield* Effect.exit(p.click("Unhandled"))
      assert.match(
        Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "",
        /nothing handles "click"/
      )
    }).pipe(play))

  it.effect("keydown on document settles UI work without advancing TestClock, checks ignored/missing listeners, and keeps TestGlobalEvents.fire non-settling", () =>
    Effect.gen(function*() {
      const source = TestGlobalEvents.make()
      const Shortcuts = Html.component({
        name: "Shortcuts",
        model: Schema.Struct({
          listening: Schema.Boolean,
          ticks: Schema.Number,
          entries: Schema.Array(Schema.String)
        }),
        message: Schema.String
      }).make({
        init: () => ({ listening: true, ticks: 0, entries: [] }),
        update: ($, message) => {
          if (message === "tick") {
            return { ...$.model, ticks: $.model.ticks + 1 }
          }
          if (message === "stop") return { ...$.model, listening: false }
          return { ...$.model, entries: [...$.model.entries, message] }
        },
        view: (h, model) =>
          h.div(
            h.output(`${model.ticks}:${model.entries.join(",")}`)
          ),
        subscriptions: ({ model }) => [
          model.entries.length > 0 &&
          Subscription.make(
            "clock",
            Stream.tick(Duration.millis(100)).pipe(
              Stream.drop(1),
              Stream.as("tick")
            )
          ),
          model.listening &&
          HtmlSubscription.onDocument("keydown", (event) => {
            if (event.key === "Escape") return undefined
            if (event.key === "q") return "stop"
            if (event.key === "n") {
              source.fire("window", "blur")
              return undefined
            }
            if (event.key === "o") {
              source.fire("document", "keydown", { key: "i" })
              return undefined
            }
            return `${event.key}:${event.shift}:${event.defaultPrevented}`
          }),
          HtmlSubscription.onWindow("blur", "blur")
        ]
      })

      // Works with only TestHost.layer(): settles without advancing TestClock.
      yield* play(Effect.gen(function*() {
        const start = yield* Clock.currentTimeMillis
        const p = yield* HtmlPlay.make(Shortcuts, {})
        yield* p.keydown("document", "ArrowUp")
        assert.strictEqual(yield* Clock.currentTimeMillis, start)
        assert.strictEqual(
          p.root.text(),
          "0:ArrowUp:false:false"
        )
        yield* p.keydown("document", "ArrowRight", {
          shift: true,
          defaultPrevented: true
        })
        assert.strictEqual(yield* Clock.currentTimeMillis, start)
        assert.strictEqual(
          p.root.text(),
          "0:ArrowUp:false:false,ArrowRight:true:true"
        )
        yield* TestClock.adjust("100 millis")
        yield* p.expect(log).toHaveText(
          "1:ArrowUp:false:false,ArrowRight:true:true"
        )
        yield* p.keydown("document", "Escape")
        yield* p.expectIgnored()
        yield* p.keydown("document", "q")
        const missing = yield* Effect.exit(p.keydown("document", "ArrowUp"))
        assert.match(
          Exit.isFailure(missing) ? Cause.pretty(missing.cause) : "",
          /nothing listens for "keydown" on the document/
        )
      }))

      // Shares TestGlobalEvents.layer when provided, while TestGlobalEvents.fire stays non-settling.
      yield* Effect.gen(function*() {
        const p = yield* HtmlPlay.make(Shortcuts, {})
        const other = yield* HtmlPlay.make(Shortcuts, {})
        yield* p.keydown("document", "a")
        assert.strictEqual(p.root.text(), "0:a:false:false")
        assert.strictEqual(other.root.text(), "0:a:false:false")
        yield* TestGlobalEvents.fire("document", "keydown", { key: "b" })
        assert.strictEqual(p.root.text(), "0:a:false:false")
        yield* TestHost.settle
        assert.strictEqual(p.root.text(), "0:a:false:false,b:false:false")
        assert.strictEqual(other.root.text(), "0:a:false:false,b:false:false")
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer))
      )

      // A root TestHost.mount mounted on the shared document hears the key, and the step settles it.
      yield* Effect.gen(function*() {
        const quiet = yield* HtmlPlay.make(Checkout, {})
        const mounted = yield* TestHost.mount(Shortcuts, {})
        yield* quiet.keydown("document", "c")
        assert.deepStrictEqual(mounted.model()?.entries, ["c:false:false"])
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer))
      )

      // Preserves a caller-supplied HtmlSubscription.GlobalEvents without TestGlobalEvents.
      yield* Effect.gen(function*() {
        const p = yield* HtmlPlay.make(Shortcuts, {})
        yield* p.keydown("document", "a")
        assert.strictEqual(p.root.text(), "0:a:false:false")
        source.fire("document", "keydown", { key: "b" })
        source.fire("window", "blur")
        assert.strictEqual(p.root.text(), "0:a:false:false")
        yield* TestHost.settle
        assert.strictEqual(p.root.text(), "0:a:false:false,b:false:false,blur")
        // A message from an event the key handler fires doesn't count as the key's.
        yield* p.keydown("document", "n")
        yield* p.expectIgnored()
        assert.strictEqual(
          p.root.text(),
          "0:a:false:false,b:false:false,blur,blur"
        )
        // Nor does one from a nested keydown.
        yield* p.keydown("document", "o")
        yield* p.expectIgnored()
        assert.strictEqual(
          p.root.text(),
          "0:a:false:false,b:false:false,blur,blur,i:false:false"
        )
      }).pipe(
        Effect.scoped,
        Effect.provideService(HtmlSubscription.GlobalEvents, source),
        Effect.provide(TestHost.layer())
      )

      // Direct HtmlSubscription.GlobalEvents.listen callback counts as heard (ignored), then missing after unsubscribe.
      let hits = 0
      let detach: (() => void) | undefined
      const Direct = Html.component({
        name: "Direct",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.p("direct"),
        subscriptions: () => [
          Subscription.make(
            "direct",
            Stream.unwrap(
              Effect.map(HtmlSubscription.GlobalEvents, (events) => {
                detach = events.listen(
                  "document",
                  "keydown",
                  { capture: false },
                  () => {
                    hits++
                  }
                )
                return Stream.never
              })
            )
          )
        ]
      })
      yield* play(Effect.gen(function*() {
        const p = yield* HtmlPlay.make(Direct, {})
        yield* p.keydown("document", "a")
        assert.strictEqual(hits, 1)
        yield* p.expectIgnored()
        detach?.()
        const missing = yield* Effect.exit(p.keydown("document", "a"))
        assert.match(
          Exit.isFailure(missing) ? Cause.pretty(missing.cause) : "",
          /nothing listens for "keydown" on the document/
        )
      }))
    }))
})
