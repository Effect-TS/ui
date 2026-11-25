// @vitest-environment happy-dom
import { Command, Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlHydrate, HtmlServer } from "@effect/ui/html"
import { HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Schema } from "effect"
import { describe, vi } from "vitest"

class TestPicker extends HTMLElement {
  color = ""
  value: unknown = undefined
}
customElements.define("test-picker", TestPicker)

const Picker = Html.customElement({
  tag: "test-picker",
  properties: {
    color: Schema.String,
    value: Schema.Array(Schema.Number)
  },
  events: {
    "color-changed": Schema.Struct({ value: Schema.String }),
    change: Schema.Struct({ color: Schema.String }),
    cleared: Schema.Struct({})
  }
})

const Message = UiSchema.TaggedEnum({
  ChangedColor: { color: Schema.String },
  Cleared: {},
  Toggled: {},
  Saved: { color: Schema.String }
})

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

const picker = (app: HTMLElement) =>
  app.querySelector("test-picker") as TestPicker | null

const send = (target: Element, event: string, init: CustomEventInit) =>
  target.dispatchEvent(new CustomEvent(event, init))

const stops = [1, 2]

const Swatch = Html.component({
  name: "Swatch",
  model: Schema.Struct({ color: Schema.String, cleared: Schema.Number }),
  message: Message
}).make({
  init: () => ({ color: "#000", cleared: 0 }),
  update: {
    ChangedColor: ($, { color }) => ({ ...$.model, color }),
    Cleared: ($) => ({ ...$.model, cleared: $.model.cleared + 1 }),
    Toggled: ($) => $.model,
    Saved: ($) => $.model
  },
  view: (h, { cleared, color }) =>
    h.div(
      Picker(h)
        .class("swatch")
        .color(color)
        .value(stops)
        .onColorChanged(({ value }) => Message.ChangedColor({ color: value }))
        .onChange(({ color }) => Message.ChangedColor({ color }))
        .onCleared(Message.Cleared()),
      h.output(`${color} ${cleared}`)
    )
})

describe("Html.customElement", () => {
  it.effect("sets properties, takes events and reconnects while a Command runs", () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      class Save extends Command.Service<Save>()(
        "Save",
        { args: { color: Schema.String } },
        Effect.succeed(({ color }) =>
          Deferred.await(gate).pipe(Effect.as(Message.Saved({ color })))
        )
      ) {}
      const App = Html.component({
        name: "App",
        model: Schema.Struct({
          color: Schema.String,
          shown: Schema.Boolean,
          saved: Schema.Array(Schema.String)
        }),
        message: Message
      }).make({
        init: () => ({ color: "#000", shown: true, saved: [] }),
        update: {
          ChangedColor: ($, { color }) =>
            $.set({ ...$.model, color }).run(Save.make({ color })),
          Cleared: ($) => $.model,
          Toggled: ($) => ({ ...$.model, shown: !$.model.shown }),
          Saved: ($, { color }) => ({
            ...$.model,
            saved: [...$.model.saved, color]
          })
        },
        view: (h, { color, saved, shown }) =>
          h.div(
            h.button.onClick(Message.Toggled()).children("Toggle"),
            shown &&
              Picker(h)
                .attr("aria-label", "Color")
                .color(color)
                .onColorChanged(({ value }) =>
                  Message.ChangedColor({ color: value })
                ),
            h.output(saved.join(","))
          )
      }).pipe(Component.provide(Save.layer))
      const app = yield* container
      yield* BrowserHost.mountEffect(App, {}, app)
      yield* tick
      const first = picker(app)!
      expect(first.color).toBe("#000")
      expect(first.getAttribute("aria-label")).toBe("Color")
      expect(first.hasAttribute("color")).toBe(false)

      send(first, "color-changed", { detail: { value: "#f00" }, bubbles: true })
      yield* tick
      expect(first.color).toBe("#f00")

      const toggle = app.querySelector("button")!
      toggle.click()
      yield* tick
      expect(picker(app)).toBeNull()
      toggle.click()
      yield* tick
      const second = picker(app)!
      expect(second.color).toBe("#f00")

      send(second, "color-changed", {
        detail: { value: "#0f0" },
        bubbles: true
      })
      yield* tick
      expect(second.color).toBe("#0f0")
      expect(app.querySelector("output")!.textContent).toBe("")

      yield* Deferred.succeed(gate, undefined)
      yield* tick
      expect(app.querySelector("output")!.textContent).toBe("#f00,#0f0")
    }).pipe(Effect.scoped))

  it.effect("decodes each event's detail, also for an HTML event name, logs one its Schema rejects, and decodes a missing one as {}", () =>
    Effect.gen(function*() {
      const error = vi.spyOn(console, "error").mockImplementation(() => {})
      yield* Effect.addFinalizer(() => Effect.sync(() => error.mockRestore()))
      const app = yield* container
      yield* BrowserHost.mountEffect(Swatch, {}, app)
      yield* tick
      send(picker(app)!, "color-changed", {
        detail: { value: 1 },
        bubbles: true
      })
      send(picker(app)!, "cleared", { bubbles: true })
      send(picker(app)!, "change", {
        detail: { color: "#abc" },
        bubbles: true
      })
      yield* tick
      expect(app.querySelector("output")!.textContent).toBe("#abc 1")
      expect(error).toHaveBeenCalledOnce()
    }).pipe(Effect.scoped))

  it.effect("an event that doesn't bubble reaches only its target's handler", () =>
    Effect.gen(function*() {
      const Nested = Html.component({
        name: "Nested",
        model: Schema.Number,
        message: Message
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h, cleared) =>
          Picker(h).onCleared(Message.Cleared()).children(
            Picker(h).attr("id", "inner"),
            h.output(String(cleared))
          )
      })
      const app = yield* container
      yield* BrowserHost.mountEffect(Nested, {}, app)
      yield* tick
      const inner = app.querySelector("#inner")!
      send(inner, "cleared", {})
      yield* tick
      expect(app.querySelector("output")!.textContent).toBe("0")
      send(inner, "cleared", { bubbles: true })
      yield* tick
      expect(app.querySelector("output")!.textContent).toBe("1")
    }).pipe(Effect.scoped))

  it.effect("value is a plain property, written when the view changes it", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Swatch, {}, app)
      yield* tick
      const element = picker(app)!
      expect(element.value).toEqual([1, 2])
      element.value = [3]
      send(element, "cleared", { bubbles: true })
      yield* tick
      expect(element.value).toEqual([3])
    }).pipe(Effect.scoped))

  it.effect("the server renders no properties, and hydration sets them on the server's element", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(Swatch, {})
      expect(rendered.html).toContain(
        `<test-picker class="swatch"></test-picker>`
      )
      const app = yield* container
      app.innerHTML = rendered.html
      const server = picker(app)!
      yield* HtmlHydrate.hydrateEffect(Swatch, {}, app, rendered.state)
      yield* tick
      expect(picker(app)).toBe(server)
      expect(server.color).toBe("#000")
      expect(server.value).toEqual([1, 2])
      send(server, "color-changed", {
        detail: { value: "#f00" },
        bubbles: true
      })
      yield* tick
      expect(server.color).toBe("#f00")
    }).pipe(Effect.scoped))

  it("throws for a tag that isn't a custom element name, and for two events with one method name", () => {
    expect(() => Html.customElement({ tag: "picker" })).toThrow()
    expect(() =>
      Html.customElement({
        tag: "test-twin",
        events: {
          "color-changed": Schema.Struct({}),
          colorChanged: Schema.Struct({})
        }
      })
    ).toThrow()
  })

  it.effect("HtmlPlay.fireElement sends a declared event with its detail", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Swatch, {})
      yield* play.fireElement(
        Picker,
        Locator.tag("test-picker"),
        "color-changed",
        {
          value: "#f00"
        }
      )
      yield* play.expect(Locator.tag("output")).toHaveText("#f00 0")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
