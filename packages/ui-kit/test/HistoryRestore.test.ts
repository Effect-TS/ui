// @vitest-environment happy-dom
import { Command, Component, Route, Router, UiSchema } from "@effect/ui"
import { Autocomplete, Combobox, NumberField, OTPField, Popover, ScrollArea, Select, Slider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { container, tick } from "./utils/document.ts"

const items = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "blueberry", label: "Blueberry" }
] as const

const PageRoute = Route.union({ Edit: Route.make("/"), Away: Route.make("/away") })
const PageMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: PageRoute },
  SetPopoverOpen: { open: Schema.Boolean },
  SetAutocompleteValue: { value: Schema.String },
  SetComboboxInput: { value: Schema.String },
  SetSelectValue: { value: Schema.NullOr(Schema.String) },
  SetSliderValue: { value: Schema.Number },
  Left: {},
  Navigated: {}
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Schema.Struct({ route: PageRoute }),
  model: Schema.Struct({
    route: PageRoute,
    popoverOpen: Schema.Boolean,
    autocompleteValue: Schema.String,
    comboboxInput: Schema.String,
    selectValue: Schema.NullOr(Schema.String),
    sliderValue: Schema.Number
  }),
  message: PageMessage,
  elements: Html
}).make({
  init: ($) => ({
    route: $.props.route,
    popoverOpen: false,
    autocompleteValue: "",
    comboboxInput: "",
    selectValue: null,
    sliderValue: 25
  }),
  update: {
    ChangedRoute: (model, { route }) => ({ ...model, route }),
    SetPopoverOpen: (model, { open }) => ({ ...model, popoverOpen: open }),
    SetAutocompleteValue: (model, { value }) => ({ ...model, autocompleteValue: value }),
    SetComboboxInput: (model, { value }) => ({ ...model, comboboxInput: value }),
    SetSelectValue: (model, { value }) => ({ ...model, selectValue: value }),
    SetSliderValue: (model, { value }) => ({ ...model, sliderValue: value }),
    Left: (model, _message, $) =>
      $.set(model).run(Router.push(PageRoute, PageRoute.Away()).pipe(Command.map(() => PageMessage.Navigated()))),
    Navigated: (model) => model
  },
  subscriptions: (model) => [
    Router.subscription(PageRoute, model.route, (route) => PageMessage.ChangedRoute({ route }))
  ],
  view: (model, h) =>
    h.div(
      h.button.attr("data-testid", "away").onClick(PageMessage.Left()).children("Away"),
      model.route._tag === "Edit"
        ? h.div(
          Popover(h, {
            key: "popover",
            props: { open: model.popoverOpen },
            onEmit: (event) => {
              if (event._tag === "RequestedOpen") return PageMessage.SetPopoverOpen({ open: true })
              if (event._tag === "RequestedClose") return PageMessage.SetPopoverOpen({ open: false })
              return undefined
            },
            view: (popover) =>
              h.div(
                popover.trigger({
                  element: h.button.attr("data-testid", "popover-trigger"),
                  openOnHover: true,
                  delay: 100
                }).children("Open"),
                popover.popup(h.div).children("Body")
              )
          }),
          Autocomplete(h, {
            key: "autocomplete",
            props: { open: true, value: model.autocompleteValue, items },
            onEmit: (event) =>
              event._tag === "Updated" ? PageMessage.SetAutocompleteValue({ value: event.value }) : undefined,
            view: (ac) =>
              h.div(
                ac.input(h.input.attr("data-testid", "ac-input")),
                ac.list(h.div).children(
                  ...ac.items.map((item) =>
                    ac.item(h.div.attr("data-testid", `ac-item-${item.value}`), item.value).children(item.label)
                  )
                )
              )
          }),
          Combobox(h, {
            key: "combobox",
            props: { open: true, value: null, inputValue: model.comboboxInput, items },
            onEmit: (event) =>
              event._tag === "RequestedInputValue"
                ? PageMessage.SetComboboxInput({ value: event.inputValue })
                : undefined,
            view: (cb) =>
              h.div(
                cb.input(h.input.attr("data-testid", "cb-input")),
                cb.list(h.div).children(
                  ...cb.items.map((item) =>
                    cb.item(h.div.attr("data-testid", `cb-item-${item.value}`), item.value).children(item.label)
                  )
                )
              )
          }),
          Select(h, {
            key: "select",
            props: { open: false, value: model.selectValue, items },
            onEmit: (event) =>
              event._tag === "Picked" && (typeof event.value === "string" || event.value === null)
                ? PageMessage.SetSelectValue({ value: event.value })
                : undefined,
            view: (select) =>
              select.trigger(h.button.attr("data-testid", "select-trigger")).children(model.selectValue ?? "none")
          }),
          NumberField(h, {
            key: "number",
            props: { value: 12 },
            view: (nf) => nf.root(h.div).children(nf.input(h.input.attr("data-testid", "nf-input")))
          }),
          OTPField(h, {
            key: "otp",
            props: { value: "12", length: 2 },
            view: (otp) =>
              otp.root(h.div).children(
                Array.from(
                  { length: otp.length },
                  (_, index) => otp.input({ element: h.input.attr("data-testid", `otp-slot-${index}`), index })
                )
              )
          }),
          Slider(h, {
            key: "slider",
            props: { value: model.sliderValue },
            onEmit: (event) =>
              event._tag === "Moved" && typeof event.value === "number"
                ? PageMessage.SetSliderValue({ value: event.value })
                : undefined,
            view: (slider) =>
              slider.root(h.div.attrs({ "data-testid": "slider-root", "data-active": String(slider.activeThumbIndex) }))
                .children(
                  slider.control(h.div.attr("data-testid", "slider-control")).children(
                    slider.track(h.div).children(
                      slider.thumb({
                        element: h.div.attr("data-testid", "slider-thumb"),
                        input: h.input.attr("data-testid", "slider-input")
                      })
                    )
                  )
                )
          }),
          ScrollArea(h, {
            key: "scroll",
            props: {},
            view: (sa) =>
              sa.root(h.div.attr("data-testid", "sa-root")).children(
                sa.viewport(h.div.attr("data-testid", "sa-viewport")).children(sa.content(h.div).children("Body"))
              )
          })
        )
        : null
    )
})

describe("History restore", { concurrent: false }, () => {
  it.effect("clears transient interaction state on Back while keeping parent-controlled values", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, Router.props(PageRoute))
      const at = (id: string) => root.get(Locator.testId(id))
      yield* TestHost.settle

      Locator.fire(at("popover-trigger"), "mouseenter")
      yield* TestHost.settle
      yield* TestClock.adjust("100 millis")
      yield* TestHost.settle
      assert.strictEqual(at("popover-trigger").attrs?.["aria-expanded"], "true")

      Locator.fire(at("ac-input"), "input", { value: "b" })
      yield* TestHost.settle
      Locator.fire(at("ac-item-banana"), "mouseenter")
      Locator.fire(at("cb-input"), "input", { value: "b" })
      yield* TestHost.settle
      Locator.fire(at("cb-item-banana"), "mouseenter")
      Locator.fire(at("select-trigger"), "keydown", { key: "b" })
      Locator.fire(at("nf-input"), "input", { value: "12." })
      Locator.fire(at("otp-slot-0"), "focus")
      Locator.fire(at("slider-input"), "focus")
      yield* TestHost.settle

      assert.strictEqual(at("ac-input").props?.value, "b")
      assert.strictEqual(at("ac-item-banana").attrs?.["data-highlighted"], "")
      assert.strictEqual(at("cb-input").props?.value, "b")
      assert.strictEqual(at("cb-item-banana").attrs?.["data-highlighted"], "")
      assert.strictEqual(Locator.textOf(at("select-trigger")), "banana")
      assert.strictEqual(at("nf-input").props?.value, "12.")
      assert.strictEqual(at("otp-slot-0").attrs?.["data-focused"], "")
      assert.strictEqual(at("slider-root").attrs?.["data-active"], "0")

      Locator.fire(at("away"), "click")
      yield* TestHost.settle
      history.go(-1)
      yield* TestHost.settle

      const saved = JSON.stringify(history.current().state)
      assert.include(saved, "/Page")
      for (
        const key of [
          "Popover[popover]",
          "Autocomplete[autocomplete]",
          "Combobox[combobox]",
          "Select[select]",
          "NumberField[number]",
          "OTPField[otp]",
          "Slider[slider]",
          "ScrollArea[scroll]"
        ]
      ) {
        assert.notInclude(saved, key)
      }

      assert.strictEqual(at("popover-trigger").attrs?.["aria-expanded"], "true")
      assert.strictEqual(at("ac-input").props?.value, "b")
      assert.isUndefined(at("ac-item-banana").attrs?.["data-highlighted"])
      assert.strictEqual(at("cb-input").props?.value, "b")
      assert.isUndefined(at("cb-item-banana").attrs?.["data-highlighted"])
      assert.strictEqual(Locator.textOf(at("select-trigger")), "banana")
      assert.strictEqual(at("nf-input").props?.value, "12")
      assert.isUndefined(at("otp-slot-0").attrs?.["data-focused"])
      assert.strictEqual(at("slider-root").attrs?.["data-active"], "-1")

      Locator.fire(at("popover-trigger"), "click")
      yield* TestHost.settle
      assert.strictEqual(at("popover-trigger").attrs?.["aria-expanded"], "false")

      Locator.fire(at("select-trigger"), "keydown", { key: "a" })
      yield* TestHost.settle
      assert.strictEqual(Locator.textOf(at("select-trigger")), "apple")
    }).pipe(
      Effect.provide(Router.make({ routes: PageRoute, history })),
      Effect.provide(
        Layer.merge(
          TestHost.layer(),
          Layer.succeed(Html.Host, {
            focus: () => {},
            blur: () => {},
            scrollIntoView: () => {},
            measure: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
            select: () => {},
            requestSubmit: () => false
          })
        )
      )
    )
  })

  it.effect("clears a Slider drag and ScrollArea scrolling on Back while keeping the moved value", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const app = yield* container
      const at = <E extends HTMLElement = HTMLElement>(id: string) => app.querySelector<E>(`[data-testid="${id}"]`)!
      yield* BrowserHost.mountEffect(Page, Router.props(PageRoute), app)
      yield* tick

      at("slider-control").getBoundingClientRect = () => new DOMRect(0, 0, 100, 20)
      at("slider-thumb").getBoundingClientRect = () => new DOMRect(20, 0, 10, 20)
      at("slider-thumb").dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 25, bubbles: true })
      )
      document.dispatchEvent(
        new PointerEvent("pointermove", { pointerId: 1, buttons: 1, clientX: 60, bubbles: true })
      )

      const viewport = at("sa-viewport")
      Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 100 })
      Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 400 })
      viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      viewport.scrollTop = 80
      viewport.dispatchEvent(new Event("scroll"))
      yield* tick

      assert.isTrue(at("slider-root").hasAttribute("data-dragging"))
      assert.strictEqual(at<HTMLInputElement>("slider-input").value, "60")
      assert.isTrue(at("sa-root").hasAttribute("data-scrolling"))

      at("away").click()
      yield* tick
      assert.isNull(app.querySelector("[data-testid=\"slider-root\"]"))

      history.go(-1)
      yield* tick

      assert.isFalse(at("slider-root").hasAttribute("data-dragging"))
      assert.strictEqual(at<HTMLInputElement>("slider-input").value, "60")
      assert.isFalse(at("sa-root").hasAttribute("data-scrolling"))
    }).pipe(Effect.provide(Router.make({ routes: PageRoute, history })))
  })
})
