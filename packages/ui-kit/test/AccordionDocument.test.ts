// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Accordion, AccordionItem } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const PageProps = Schema.Struct({
  multiple: Schema.Boolean,
  disabled: Schema.optional(Schema.Boolean),
  initial: Schema.Array(Schema.String)
})

const PageMessage = UiSchema.TaggedEnum({
  Toggled: { value: Schema.Array(Schema.String), reason: Schema.String },
  ToggledItem: { item: Schema.String, open: Schema.Boolean }
})

const items = ["a", "b", "c"]

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: PageProps,
  model: Schema.Struct({ open: Schema.Array(Schema.String), log: Schema.Array(Schema.String) }),
  message: PageMessage,
  elements: Html
}).make({
  init: ($) => ({ open: $.props.initial, log: [] }),
  update: {
    Toggled: (model, { value, reason }) => ({
      open: value,
      log: [...model.log, `Toggled [${value.join(",")}] ${reason}`]
    }),
    ToggledItem: (model, { item, open }) => ({ ...model, log: [...model.log, `ToggledItem ${item} ${open}`] })
  },
  view: (model, h) =>
    Accordion(h, {
      props: { value: model.open, multiple: h.props.multiple, disabled: h.props.disabled },
      onEmit: { Toggled: ({ value, reason }) => PageMessage.Toggled({ value, reason }) },
      view: (accordion) =>
        accordion.root(h.div.attr("id", "root")).children(
          items.map((value, index) =>
            AccordionItem(h, {
              key: value,
              props: { value, index, disabled: value === "c" },
              onEmit: {
                Toggled: ({ open }) => PageMessage.ToggledItem({ item: value, open }),
                Settled: () => undefined
              },
              view: (item) =>
                item.root(h.div.attr("id", "item-" + value)).children(
                  item.header(h.h3).children(
                    item.trigger(h.button.attr("id", "trigger-" + value)).children(value)
                  ),
                  item.panel(h.div.attr("id", "panel-" + value))?.children("Answer " + value)
                )
            })
          )
        )
    })
})

const open = () => items.filter((value) => document.getElementById("panel-" + value) !== null)

const press = (value: string) => Effect.sync(() => byId("trigger-" + value).click()).pipe(Effect.andThen(tick))

describe("AccordionDocument", { concurrent: false }, () => {
  it.effect("opening an item closes the open one, and pressing it again closes it", () =>
    Effect.gen(function*() {
      const app = yield* container
      const handle = yield* BrowserHost.mountEffect(Page, { multiple: false, initial: ["a"] }, app)
      yield* tick
      assert.deepStrictEqual(open(), ["a"])
      assert.strictEqual(byId("panel-a").getAttribute("aria-labelledby"), "trigger-a")
      assert.strictEqual(byId("trigger-a").getAttribute("aria-controls"), "panel-a")

      yield* press("b")
      assert.deepStrictEqual(byId("trigger-b").getAttribute("aria-expanded"), "true")
      assert.strictEqual(byId("trigger-a").getAttribute("aria-expanded"), "false")
      assert.isTrue(byId("item-b").hasAttribute("data-open"))

      yield* press("b")
      assert.strictEqual(byId("trigger-b").getAttribute("aria-expanded"), "false")

      yield* press("c")
      assert.isTrue((byId("trigger-c") as HTMLButtonElement).disabled)
      assert.deepStrictEqual(handle.model()!.log, [
        "Toggled [b] trigger-press",
        "ToggledItem b true",
        "Toggled [] trigger-press",
        "ToggledItem b false"
      ])
    }).pipe(Effect.scoped))

  it.effect("with multiple, several items stay open", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Page, { multiple: true, initial: [] }, app)
      yield* tick
      yield* press("a")
      yield* press("b")
      assert.strictEqual(byId("trigger-a").getAttribute("aria-expanded"), "true")
      assert.strictEqual(byId("trigger-b").getAttribute("aria-expanded"), "true")
      yield* press("a")
      assert.strictEqual(byId("trigger-a").getAttribute("aria-expanded"), "false")
      assert.strictEqual(byId("trigger-b").getAttribute("aria-expanded"), "true")
    }).pipe(Effect.scoped))

  it.effect("a disabled accordion disables every trigger and opens nothing", () =>
    Effect.gen(function*() {
      const app = yield* container
      const handle = yield* BrowserHost.mountEffect(Page, { multiple: false, disabled: true, initial: [] }, app)
      yield* tick
      yield* press("a")
      assert.isTrue((byId("trigger-a") as HTMLButtonElement).disabled)
      assert.isTrue(byId("root").hasAttribute("data-disabled"))
      assert.strictEqual(byId("trigger-a").getAttribute("aria-expanded"), "false")
      assert.deepStrictEqual(handle.model()!.log, [])
    }).pipe(Effect.scoped))
})
