// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Accordion, AccordionItem } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, tick } from "./utils/document.ts"

const PageProps = Schema.Struct({
  multiple: Schema.Boolean,
  wrapTriggers: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  initial: Schema.Array(Schema.String)
})

const PageMessage = UiSchema.TaggedEnum({
  Toggled: { value: Schema.Array(Schema.String), reason: Schema.String },
  ToggledItem: { item: Schema.String, open: Schema.Boolean },
  Reversed: {}
})

const items = ["a", "b", "c"]

const Page = Html.component({
  name: "Page",
  props: PageProps,

  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    order: Schema.Array(Schema.String),
    log: Schema.Array(Schema.String)
  }),

  message: PageMessage
}).make({
  init: ($) => ({ open: $.props.initial, order: items, log: [] }),
  update: {
    Toggled: ($, { value, reason }) => ({
      ...$.model,
      open: value,
      log: [...$.model.log, `Toggled [${value.join(",")}] ${reason}`]
    }),
    ToggledItem: ($, { item, open }) => ({
      ...$.model,
      log: [...$.model.log, `ToggledItem ${item} ${open}`]
    }),
    Reversed: ($) => ({ ...$.model, order: [...$.model.order].reverse() })
  },
  view: (h, model) =>
    h.main.children(
      h.button.attr("id", "reverse").onClick(PageMessage.Reversed()).children(
        "Reverse"
      ),
      Accordion(h, {
        props: {
          value: model.open,
          multiple: h.props.multiple,
          disabled: h.props.disabled
        },
        onEmit: {
          Toggled: ({ value, reason }) => PageMessage.Toggled({ value, reason })
        },
        view: (accordion) =>
          accordion.root(h.div.attr("id", "root")).children(h.section.children(
            model.order.map((value) =>
              AccordionItem(h, {
                key: value,
                props: { value, disabled: value === "c" },
                onEmit: {
                  Toggled: ({ open }) =>
                    PageMessage.ToggledItem({ item: value, open }),
                  Settled: () => undefined
                },
                view: (item) =>
                  item.root(h.div.attr("id", "item-" + value)).children(
                    item.header(h.h3).children(
                      item.trigger(
                        h.props.wrapTriggers === true
                          ? h.button.attr("id", "trigger-" + value).forward((
                            button
                          ) =>
                            h.span.attr("id", "wrapper-" + value).children(
                              button
                            )
                          )
                          : h.button.attr("id", "trigger-" + value)
                      ).children(value)
                    ),
                    item.panel(h.div.attr("id", "panel-" + value))?.children(
                      "Answer " + value
                    )
                  )
              })
            )
          ))
      })
    )
})

const open = () =>
  items.filter((value) => document.getElementById("panel-" + value) !== null)

const press = (value: string) =>
  Effect.sync(() => byId("trigger-" + value).click()).pipe(Effect.andThen(tick))

describe("AccordionDocument", { concurrent: false }, () => {
  it.effect("toggles items in single and multiple mode, and ignores disabled items or a disabled accordion", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        const app = yield* container
        const handle = yield* BrowserHost.mountEffect(Page, {
          multiple: false,
          initial: ["a"]
        }, app)
        yield* tick
        assert.deepStrictEqual(open(), ["a"])
        assert.strictEqual(
          byId("panel-a").getAttribute("aria-labelledby"),
          "trigger-a"
        )
        assert.strictEqual(
          byId("trigger-a").getAttribute("aria-controls"),
          "panel-a"
        )

        yield* press("b")
        assert.strictEqual(
          byId("trigger-b").getAttribute("aria-expanded"),
          "true"
        )
        assert.strictEqual(
          byId("trigger-a").getAttribute("aria-expanded"),
          "false"
        )
        assert.isTrue(byId("item-b").hasAttribute("data-open"))

        yield* press("b")
        assert.strictEqual(
          byId("trigger-b").getAttribute("aria-expanded"),
          "false"
        )

        yield* press("c")
        assert.isTrue((byId("trigger-c") as HTMLButtonElement).disabled)
        assert.deepStrictEqual(handle.model()!.log, [
          "Toggled [b] trigger-press",
          "ToggledItem b true",
          "Toggled [] trigger-press",
          "ToggledItem b false"
        ])
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const app = yield* container
        yield* BrowserHost.mountEffect(
          Page,
          { multiple: true, initial: [] },
          app
        )
        yield* tick
        yield* press("a")
        yield* press("b")
        assert.strictEqual(
          byId("trigger-a").getAttribute("aria-expanded"),
          "true"
        )
        assert.strictEqual(
          byId("trigger-b").getAttribute("aria-expanded"),
          "true"
        )
        yield* press("a")
        assert.strictEqual(
          byId("trigger-a").getAttribute("aria-expanded"),
          "false"
        )
        assert.strictEqual(
          byId("trigger-b").getAttribute("aria-expanded"),
          "true"
        )
      }))

      yield* Effect.scoped(Effect.gen(function*() {
        const app = yield* container
        const handle = yield* BrowserHost.mountEffect(Page, {
          multiple: false,
          disabled: true,
          initial: []
        }, app)
        yield* tick
        yield* press("a")
        assert.isTrue((byId("trigger-a") as HTMLButtonElement).disabled)
        assert.isTrue(byId("root").hasAttribute("data-disabled"))
        assert.strictEqual(
          byId("trigger-a").getAttribute("aria-expanded"),
          "false"
        )
        assert.deepStrictEqual(handle.model()!.log, [])
      }))
    }))

  it.effect("numbers items in the order they're drawn, and renumbers them after a reorder", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(
        Page,
        { multiple: false, initial: ["b"] },
        app
      )
      yield* tick
      const indexes = () =>
        Array.from(app.querySelectorAll("[id^=item-]"), (item) => {
          const value = item.id.slice("item-".length)
          return [
            value,
            item.getAttribute("data-index"),
            byId("trigger-" + value).getAttribute("data-index")
          ]
        })
      assert.deepStrictEqual(indexes(), [["a", "0", "0"], ["b", "1", "1"], [
        "c",
        "2",
        "2"
      ]])
      assert.strictEqual(byId("panel-b").getAttribute("data-index"), "1")

      byId("reverse").click()
      yield* tick
      assert.deepStrictEqual(indexes(), [["c", "0", "0"], ["b", "1", "1"], [
        "a",
        "2",
        "2"
      ]])
      assert.strictEqual(byId("panel-b").getAttribute("data-index"), "1")
      assert.strictEqual(
        byId("panel-b").getAttribute("aria-labelledby"),
        "trigger-b"
      )
    }).pipe(Effect.scoped))

  it.effect("a trigger the consumer wraps with forward keeps both links on the button, not the wrapper", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Page, {
        multiple: false,
        wrapTriggers: true,
        initial: ["a"]
      }, app)
      yield* tick
      const wrapper = byId("wrapper-a")
      assert.strictEqual(byId("trigger-a").parentElement, wrapper)
      assert.strictEqual(
        byId("trigger-a").getAttribute("aria-controls"),
        "panel-a"
      )
      assert.strictEqual(
        byId("panel-a").getAttribute("aria-labelledby"),
        "trigger-a"
      )
      assert.isFalse(wrapper.hasAttribute("aria-controls"))
      assert.isFalse(wrapper.hasAttribute("aria-expanded"))

      yield* press("b")
      assert.strictEqual(
        byId("trigger-b").getAttribute("aria-controls"),
        "panel-b"
      )
      assert.strictEqual(
        byId("panel-b").getAttribute("aria-labelledby"),
        "trigger-b"
      )
      assert.isFalse(byId("wrapper-b").hasAttribute("aria-controls"))
      assert.isFalse(byId("trigger-a").hasAttribute("aria-controls"))
    }).pipe(Effect.scoped))
})
