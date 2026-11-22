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
  SetAutocompleteOpen: { open: Schema.Boolean },
  SetAutocompleteValue: { value: Schema.String },
  SetComboboxOpen: { open: Schema.Boolean },
  SetComboboxValue: { value: Schema.NullOr(Schema.String) },
  SetComboboxInput: { value: Schema.String },
  SetSelectValue: { value: Schema.NullOr(Schema.String) },
  SetNumberValue: { value: Schema.NullOr(Schema.Number) },
  SetOtpValue: { value: Schema.String },
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
    autocompleteOpen: Schema.Boolean,
    autocompleteValue: Schema.String,
    comboboxOpen: Schema.Boolean,
    comboboxValue: Schema.NullOr(Schema.String),
    comboboxInput: Schema.String,
    selectValue: Schema.NullOr(Schema.String),
    numberValue: Schema.NullOr(Schema.Number),
    otpValue: Schema.String,
    sliderValue: Schema.Number
  }),
  message: PageMessage,
  elements: Html
}).make({
  init: ($) => ({
    route: $.props.route,
    popoverOpen: false,
    autocompleteOpen: true,
    autocompleteValue: "",
    comboboxOpen: true,
    comboboxValue: null,
    comboboxInput: "",
    selectValue: null,
    numberValue: 12,
    otpValue: "12",
    sliderValue: 25
  }),
  update: {
    ChangedRoute: (model, { route }) => ({ ...model, route }),
    SetPopoverOpen: (model, { open }) => ({ ...model, popoverOpen: open }),
    SetAutocompleteOpen: (model, { open }) => ({ ...model, autocompleteOpen: open }),
    SetAutocompleteValue: (model, { value }) => ({ ...model, autocompleteValue: value }),
    SetComboboxOpen: (model, { open }) => ({ ...model, comboboxOpen: open }),
    SetComboboxValue: (model, { value }) => ({ ...model, comboboxValue: value }),
    SetComboboxInput: (model, { value }) => ({ ...model, comboboxInput: value }),
    SetSelectValue: (model, { value }) => ({ ...model, selectValue: value }),
    SetNumberValue: (model, { value }) => ({ ...model, numberValue: value }),
    SetOtpValue: (model, { value }) => ({ ...model, otpValue: value }),
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
                popover.popup(h.div.attr("data-testid", "popover-popup")).children("Body")
              )
          }),
          Autocomplete(h, {
            key: "autocomplete",
            props: { open: model.autocompleteOpen, value: model.autocompleteValue, items },
            onEmit: (event) => {
              if (event._tag === "RequestedOpen") return PageMessage.SetAutocompleteOpen({ open: true })
              if (event._tag === "RequestedClose") return PageMessage.SetAutocompleteOpen({ open: false })
              if (event._tag === "Updated") return PageMessage.SetAutocompleteValue({ value: event.value })
              return undefined
            },
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
            props: {
              open: model.comboboxOpen,
              value: model.comboboxValue,
              inputValue: model.comboboxInput,
              items
            },
            onEmit: (event) => {
              if (event._tag === "RequestedOpen") return PageMessage.SetComboboxOpen({ open: true })
              if (event._tag === "RequestedClose") return PageMessage.SetComboboxOpen({ open: false })
              if (event._tag === "Picked" && (typeof event.value === "string" || event.value === null)) {
                return PageMessage.SetComboboxValue({ value: event.value })
              }
              if (event._tag === "RequestedInputValue") {
                return PageMessage.SetComboboxInput({ value: event.inputValue })
              }
              return undefined
            },
            view: (cb) =>
              h.div(
                cb.trigger(h.button.attr("data-testid", "cb-trigger")).children("Pick"),
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
            props: { value: model.numberValue },
            onEmit: (event) =>
              event._tag === "Updated" ? PageMessage.SetNumberValue({ value: event.value }) : undefined,
            view: (nf) =>
              nf.root(h.div.attr("data-testid", "nf-root")).children(nf.input(h.input.attr("data-testid", "nf-input")))
          }),
          OTPField(h, {
            key: "otp",
            props: { value: model.otpValue, length: 2 },
            onEmit: (event) => event._tag === "Updated" ? PageMessage.SetOtpValue({ value: event.value }) : undefined,
            view: (otp) =>
              otp.root(h.div.attr("data-testid", "otp-root")).children(
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
                    slider.track(h.div.attr("data-testid", "slider-track")).children(
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
      yield* TestHost.settle

      Locator.fire(root.get(Locator.testId("popover-trigger")), "mouseenter")
      yield* TestHost.settle
      yield* TestClock.adjust("100 millis")
      yield* TestHost.settle
      assert.strictEqual(root.get(Locator.testId("popover-trigger")).attrs?.["aria-expanded"], "true")

      Locator.fire(root.get(Locator.testId("ac-input")), "input", { value: "b" })
      yield* TestHost.settle
      Locator.fire(root.get(Locator.testId("ac-item-banana")), "mouseenter")
      Locator.fire(root.get(Locator.testId("cb-input")), "input", { value: "b" })
      yield* TestHost.settle
      Locator.fire(root.get(Locator.testId("cb-item-banana")), "mouseenter")
      Locator.fire(root.get(Locator.testId("select-trigger")), "keydown", { key: "b" })
      Locator.fire(root.get(Locator.testId("nf-input")), "input", { value: "12." })
      Locator.fire(root.get(Locator.testId("otp-slot-0")), "focus")
      Locator.fire(root.get(Locator.testId("slider-input")), "focus")
      yield* TestHost.settle

      assert.strictEqual(root.get(Locator.testId("ac-input")).props?.value, "b")
      assert.strictEqual(root.get(Locator.testId("ac-item-banana")).attrs?.["data-highlighted"], "")
      assert.strictEqual(root.get(Locator.testId("cb-input")).props?.value, "b")
      assert.strictEqual(root.get(Locator.testId("cb-item-banana")).attrs?.["data-highlighted"], "")
      assert.strictEqual(Locator.textOf(root.get(Locator.testId("select-trigger"))), "banana")
      assert.strictEqual(root.get(Locator.testId("nf-input")).props?.value, "12.")
      assert.strictEqual(root.get(Locator.testId("otp-slot-0")).attrs?.["data-focused"], "")
      assert.strictEqual(root.get(Locator.testId("slider-root")).attrs?.["data-active"], "0")

      Locator.fire(root.get(Locator.testId("away")), "click")
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

      assert.strictEqual(root.get(Locator.testId("popover-trigger")).attrs?.["aria-expanded"], "true")
      assert.strictEqual(root.get(Locator.testId("ac-input")).props?.value, "b")
      assert.isUndefined(root.get(Locator.testId("ac-item-banana")).attrs?.["data-highlighted"])
      assert.strictEqual(root.get(Locator.testId("cb-input")).props?.value, "b")
      assert.isUndefined(root.get(Locator.testId("cb-item-banana")).attrs?.["data-highlighted"])
      assert.strictEqual(Locator.textOf(root.get(Locator.testId("select-trigger"))), "banana")
      assert.strictEqual(root.get(Locator.testId("nf-input")).props?.value, "12")
      assert.strictEqual(root.get(Locator.testId("otp-slot-0")).props?.value, "1")
      assert.strictEqual(root.get(Locator.testId("slider-input")).props?.value, "25")

      assert.isUndefined(root.get(Locator.testId("otp-slot-0")).attrs?.["data-focused"])
      assert.strictEqual(root.get(Locator.testId("slider-root")).attrs?.["data-active"], "-1")

      Locator.fire(root.get(Locator.testId("popover-trigger")), "click")
      yield* TestHost.settle
      assert.strictEqual(root.get(Locator.testId("popover-trigger")).attrs?.["aria-expanded"], "false")

      Locator.fire(root.get(Locator.testId("select-trigger")), "keydown", { key: "a" })
      yield* TestHost.settle
      assert.strictEqual(Locator.textOf(root.get(Locator.testId("select-trigger"))), "apple")
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

  it.effect("clears Slider drag state on Back while keeping the moved value", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Page, Router.props(PageRoute), app)
      yield* tick

      const control = app.querySelector<HTMLElement>("[data-testid=\"slider-control\"]")!
      const thumb = app.querySelector<HTMLElement>("[data-testid=\"slider-thumb\"]")!
      control.getBoundingClientRect = () =>
        ({ left: 0, right: 100, width: 100, top: 0, bottom: 20, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
      thumb.getBoundingClientRect = () =>
        ({ left: 20, right: 30, width: 10, top: 0, bottom: 20, height: 20, x: 20, y: 0, toJSON: () => ({}) }) as DOMRect

      thumb.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 25, bubbles: true }))
      document.dispatchEvent(
        new PointerEvent("pointermove", { pointerId: 1, buttons: 1, clientX: 60, bubbles: true })
      )
      yield* tick

      assert.isTrue(app.querySelector<HTMLElement>("[data-testid=\"slider-root\"]")!.hasAttribute("data-dragging"))
      assert.strictEqual(app.querySelector<HTMLInputElement>("[data-testid=\"slider-input\"]")!.value, "60")

      app.querySelector<HTMLElement>("[data-testid=\"away\"]")!.click()
      yield* tick
      yield* tick
      assert.isNull(app.querySelector("[data-testid=\"slider-root\"]"))

      history.go(-1)
      yield* tick
      yield* tick

      assert.isFalse(app.querySelector<HTMLElement>("[data-testid=\"slider-root\"]")!.hasAttribute("data-dragging"))
      assert.strictEqual(app.querySelector<HTMLInputElement>("[data-testid=\"slider-input\"]")!.value, "60")
    }).pipe(Effect.provide(Router.make({ routes: PageRoute, history })))
  })
})
