// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { RadioGroup } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const items = [
  { value: "ssd" },
  { value: "hdd", disabled: true },
  { value: "nvme" },
  { value: "tape" }
]

const Message = UiSchema.TaggedEnum({
  SetValue: { value: Schema.NullOr(Schema.String) },
  SetReadOnly: { readOnly: Schema.Boolean },
  SetShowIndicators: { show: Schema.Boolean }
})

const Host = Component.define({
  name: "RadioGroupHost",
  scoped: false,
  props: Schema.Struct({
    showIndicators: Schema.optional(Schema.Boolean),
    keepMounted: Schema.optional(Schema.Boolean)
  }),
  model: Schema.Struct({
    value: Schema.NullOr(Schema.String),
    readOnly: Schema.Boolean,
    showIndicators: Schema.Boolean
  }),
  message: Message,
  elements: Html
}).make({
  init: ({ props }) => ({ value: "ssd", readOnly: false, showIndicators: props.showIndicators ?? true }),
  update: {
    SetValue: (model, { value }) => ({ ...model, value }),
    SetReadOnly: (model, { readOnly }) => ({ ...model, readOnly }),
    SetShowIndicators: (model, { show }) => ({ ...model, showIndicators: show })
  },
  view: (model, h) =>
    h.div(
      RadioGroup(h, {
        props: { value: model.value, items, readOnly: model.readOnly },
        onEmit: { Picked: ({ value }) => Message.SetValue({ value }) },
        view: (radioGroup) =>
          radioGroup.root(h.div).children(
            ...items.map(({ value }) =>
              radioGroup.radio({ element: h.button.attr("data-value", value), value }).children(
                model.showIndicators
                  ? radioGroup.indicator({
                    element: h.span.attr("data-dot", value),
                    value,
                    keepMounted: h.props.keepMounted
                  })
                  : undefined
              )
            )
          )
      }),
      ...items.map(({ value }) =>
        h.button.attr("type", "button").attr("data-set", value).onClick(Message.SetValue({ value }))
      ),
      h.button.attr("type", "button").attr("data-readonly-toggle", "").onClick(
        Message.SetReadOnly({ readOnly: !model.readOnly })
      ),
      h.button.attr("type", "button").attr("data-indicators-toggle", "").onClick(
        Message.SetShowIndicators({ show: !model.showIndicators })
      )
    )
})

const holdExits = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Element.prototype.getAnimations
    const pending: Array<() => void> = []
    Element.prototype.getAnimations = function(this: Element) {
      if (!this.hasAttribute("data-ending-style")) return []
      let finish = () => {}
      const running = {
        effect: { getComputedTiming: () => ({ endTime: 200 }) },
        finished: new Promise<void>((resolve) => (finish = resolve))
      } as unknown as Animation
      pending.push(finish)
      return [running]
    }
    return {
      original,
      finishAll: () => {
        for (const finish of pending.splice(0)) finish()
      }
    }
  }),
  ({ original }) => Effect.sync(() => (Element.prototype.getAnimations = original))
)

const holdFrames = Effect.acquireRelease(
  Effect.sync(() => {
    const original = window.requestAnimationFrame
    const queued: Array<FrameRequestCallback> = []
    window.requestAnimationFrame = (callback) => {
      queued.push(callback)
      return queued.length
    }
    return {
      original,
      flush: () => {
        for (const callback of queued.splice(0)) callback(0)
      }
    }
  }),
  ({ original }) => Effect.sync(() => (window.requestAnimationFrame = original))
)

describe("RadioGroup in a document", { concurrent: false }, () => {
  it.effect("keeps an entering indicator mounted for exit on rapid value changes and unmounts once animations finish", () =>
    Effect.gen(function*() {
      const exits = yield* holdExits
      const frames = yield* holdFrames
      const app = yield* container
      yield* BrowserHost.mountEffect(Host, {}, app)
      yield* tick

      const dot = (value: string) => app.querySelector(`[data-dot="${value}"]`)
      const set = (value: string) => app.querySelector<HTMLButtonElement>(`[data-set="${value}"]`)!.click()

      assert.isNotNull(dot("ssd"))
      assert.isNull(dot("ssd")!.getAttribute("data-starting-style"))
      assert.isNull(dot("nvme"))

      set("nvme")
      yield* tick
      assert.strictEqual(dot("nvme")?.getAttribute("data-starting-style"), "")
      assert.strictEqual(dot("ssd")?.getAttribute("data-ending-style"), "")

      set("tape")
      yield* tick
      assert.strictEqual(dot("tape")?.getAttribute("data-starting-style"), "")
      assert.strictEqual(dot("nvme")?.getAttribute("data-ending-style"), "")
      assert.strictEqual(dot("ssd")?.getAttribute("data-ending-style"), "")

      frames.flush()
      yield* tick
      assert.isNull(dot("tape")?.getAttribute("data-starting-style"))
      assert.strictEqual(dot("nvme")?.getAttribute("data-ending-style"), "")
      assert.strictEqual(dot("ssd")?.getAttribute("data-ending-style"), "")

      exits.finishAll()
      yield* tick
      assert.isNull(dot("ssd"))
      assert.isNull(dot("nvme"))
      assert.isNotNull(dot("tape"))
    }).pipe(Effect.scoped))

  it.effect("moves the tab stop to a new controlled value after focus moved away", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Host, {}, app)
      yield* tick

      const btn = (value: string) => app.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!
      app.querySelector<HTMLButtonElement>("[data-readonly-toggle]")!.click()
      yield* tick

      btn("ssd").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
      yield* tick
      assert.strictEqual(btn("nvme").getAttribute("tabindex"), "0")
      assert.strictEqual(btn("ssd").getAttribute("tabindex"), "-1")

      app.querySelector<HTMLButtonElement>("[data-set=\"tape\"]")!.click()
      yield* tick
      assert.strictEqual(btn("tape").getAttribute("tabindex"), "0")
      assert.strictEqual(btn("nvme").getAttribute("tabindex"), "-1")
    }).pipe(Effect.scoped))

  it.effect("does not animate an exit for an indicator that was unmounted when the value changed", () =>
    Effect.gen(function*() {
      yield* holdExits
      const app = yield* container
      yield* BrowserHost.mountEffect(Host, { showIndicators: false }, app)
      yield* tick

      const dot = (value: string) => app.querySelector(`[data-dot="${value}"]`)
      const toggle = () => app.querySelector<HTMLButtonElement>("[data-indicators-toggle]")!.click()
      assert.isNull(dot("ssd"))

      app.querySelector<HTMLButtonElement>("[data-set=\"nvme\"]")!.click()
      yield* tick
      assert.isNull(dot("ssd"))
      assert.isNull(dot("nvme"))

      toggle()
      yield* tick
      assert.isNull(dot("ssd"))
      assert.isNotNull(dot("nvme"))
      assert.isNull(dot("nvme")!.getAttribute("data-ending-style"))

      toggle()
      yield* tick
      assert.isNull(dot("nvme"))

      app.querySelector<HTMLButtonElement>("[data-set=\"tape\"]")!.click()
      yield* tick
      toggle()
      yield* tick
      assert.isNull(dot("nvme"))
      assert.isNotNull(dot("tape"))
    }).pipe(Effect.scoped))

  it.effect("animates repeated exits when keepMounted keeps indicators in the document", () =>
    Effect.gen(function*() {
      const exits = yield* holdExits
      const app = yield* container
      yield* BrowserHost.mountEffect(Host, { keepMounted: true }, app)
      yield* tick

      const dot = (value: string) => app.querySelector(`[data-dot="${value}"]`)!
      const set = (value: string) => app.querySelector<HTMLButtonElement>(`[data-set="${value}"]`)!.click()

      set("nvme")
      yield* tick
      assert.strictEqual(dot("ssd").getAttribute("data-ending-style"), "")
      exits.finishAll()
      yield* tick
      assert.isNull(dot("ssd").getAttribute("data-ending-style"))

      set("ssd")
      yield* tick
      assert.strictEqual(dot("nvme").getAttribute("data-ending-style"), "")
      exits.finishAll()
      yield* tick
      assert.isNull(dot("nvme").getAttribute("data-ending-style"))

      set("nvme")
      yield* tick
      assert.strictEqual(dot("ssd").getAttribute("data-ending-style"), "")
      exits.finishAll()
      yield* tick
      assert.isNull(dot("ssd").getAttribute("data-ending-style"))
    }).pipe(Effect.scoped))
})
