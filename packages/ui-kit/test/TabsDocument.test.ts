// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Tabs } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({ Selected: { value: Schema.String } })

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ activateOnFocus: Schema.optional(Schema.Boolean) }),
  model: Schema.Struct({ tab: Schema.String }),
  message: Message
}).make({
  init: () => ({ tab: "a" }),
  update: { Selected: ($, { value }) => ({ ...$.model, tab: value }) },
  view: (h, model) =>
    Tabs(h, {
      props: {
        value: model.tab,
        activateOnFocus: h.props.activateOnFocus,
        tabs: [{ value: "a" }, { value: "b" }, { value: "c" }, {
          value: "d",
          disabled: true
        }, { value: "e" }]
      },
      onEmit: { Selected: ({ value }) => Message.Selected({ value }) },
      view: (tabs) =>
        tabs.root(h.div.class("root")).children(
          tabs.list(h.div.class("list")).children(
            tabs.tab({ element: h.button.class("a"), value: "a" }).children(
              "A"
            ),
            tabs.tab({ element: h.button.class("b"), value: "b" }).children(
              "B"
            ),
            tabs.tab({ element: h.a.class("c").attr("href", "#c"), value: "c" })
              .children("C"),
            tabs.tab({ element: h.a.class("d").attr("href", "#d"), value: "d" })
              .children("D"),
            tabs.tab({ element: h.a.class("e"), value: "e" }).children("E"),
            tabs.indicator(h.span.class("indicator"))
          ),
          ["a", "b", "c", "d", "e"].map((value) =>
            tabs.panel({ element: h.div.class("panel"), value })?.children(
              value
            )
          )
        )
    })
})

const stub = (element: Element, values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { configurable: true, value })
  }
}
const rect = (left: number, top: number, width: number, height: number) => () =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top
  }) as DOMRect

const observers: Array<() => void> = []
const fakeResizeObserver = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Object.getOwnPropertyDescriptor(window, "ResizeObserver")
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: class {
        constructor(callback: () => void) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      }
    })
    return original
  }),
  (original) =>
    Effect.sync(() => {
      observers.length = 0
      if (original === undefined) {
        delete (window as { ResizeObserver?: unknown }).ResizeObserver
      } else Object.defineProperty(window, "ResizeObserver", original)
    })
)

const mountPageWith = Effect.fnUntraced(
  function*(props: { readonly activateOnFocus?: boolean }) {
    const app = yield* container
    yield* BrowserHost.mountEffect(Page, props, app)
    yield* tick
    const get = (name: string) => app.querySelector<HTMLElement>("." + name)!
    const panels = () =>
      Array.from(app.querySelectorAll(".panel"), (panel) => panel.textContent)
    return { get, panels }
  }
)
const mountPage = Effect.suspend(() => mountPageWith({}))

const key = (
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
  type = "keydown"
) => {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}
const clicked = (target: Element) => {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe("Tabs in a document", { concurrent: false }, () => {
  it.effect("the arrow keys move focus and the roving tab, and a click swaps the panels", () =>
    Effect.gen(function*() {
      const { get, panels } = yield* mountPage
      get("a").focus()
      assert.isTrue(key(get("a"), "ArrowRight"))
      yield* tick
      assert.strictEqual(document.activeElement, get("b"))
      assert.deepStrictEqual(
        ["a", "b", "c", "d", "e"].map((id) => get(id).tabIndex),
        [-1, 0, -1, -1, -1]
      )
      key(get("b"), "End")
      yield* tick
      assert.strictEqual(document.activeElement, get("e"))

      assert.isFalse(clicked(get("b")))
      yield* tick
      assert.strictEqual(get("b").getAttribute("aria-selected"), "true")
      assert.strictEqual(get("root").dataset.activationDirection, "right")
      assert.deepStrictEqual(panels(), ["b"])
      assert.isNull(
        document.querySelector("[data-starting-style], [data-ending-style]")
      )
    }).pipe(Effect.scoped))

  it.effect("with activateOnFocus, focus during a secondary press doesn't select, and focus after the press ends does", () =>
    Effect.gen(function*() {
      const { get } = yield* mountPageWith({ activateOnFocus: true })
      const press = (tab: HTMLElement, type: string, button = 2) =>
        tab.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button
          })
        )
      let mousedowns = 0
      const cancel = (event: Event) => event.preventDefault()
      const count = () => mousedowns++
      document.addEventListener("pointerdown", cancel)
      document.addEventListener("mousedown", count)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          document.removeEventListener("pointerdown", cancel)
          document.removeEventListener("mousedown", count)
        })
      )
      const selected = () =>
        ["a", "b", "c", "d", "e"].filter((id) =>
          get(id).getAttribute("aria-selected") === "true"
        )
      const focusFrom = function*(tab: HTMLElement) {
        get("a").focus()
        yield* tick
        tab.focus()
        yield* tick
        assert.strictEqual(document.activeElement, tab)
      }

      get("d").focus()
      yield* tick
      assert.deepStrictEqual(selected(), ["a"])

      for (
        const [end, id, button] of [["pointercancel", "b", 2], [
          "pointerup",
          "c",
          1
        ]] as const
      ) {
        press(get(id), "pointerdown", button)
        yield* focusFrom(get(id))
        key(get(id), "Home")
        yield* tick
        yield* focusFrom(get(id))
        assert.deepStrictEqual(selected(), ["a"])
        get("e").focus()
        yield* tick
        assert.deepStrictEqual(selected(), ["e"])
        press(get(id), end, button)
        get(id).focus()
        yield* tick
        assert.deepStrictEqual(selected(), [id])
      }

      get("c").focus()
      yield* tick
      press(get("b"), "pointerdown", 0)
      get("b").focus()
      yield* tick
      assert.deepStrictEqual(selected(), ["b"])
      assert.strictEqual(mousedowns, 0)
    }).pipe(Effect.scoped))

  it.effect("Space clicks a tab once, with its modifiers, and Enter is left native except on an <a> without an href", () =>
    Effect.gen(function*() {
      const { get } = yield* mountPage
      const clicks: Array<string> = []
      const record = (event: MouseEvent) =>
        clicks.push(
          (event.target as Element).className + (event.ctrlKey ? "+ctrl" : "")
        )
      document.addEventListener("click", record)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => document.removeEventListener("click", record))
      )

      assert.isTrue(key(get("b"), " "))
      assert.isTrue(key(get("b"), " ", {}, "keyup"))
      yield* tick
      assert.deepStrictEqual(clicks, ["b"])
      assert.strictEqual(get("b").getAttribute("aria-selected"), "true")

      assert.isTrue(key(get("c"), " ", { ctrlKey: true }))
      assert.isFalse(key(get("c"), " ", {}, "keyup"))
      yield* tick
      assert.deepStrictEqual(clicks, ["b", "c+ctrl"])
      assert.strictEqual(get("c").getAttribute("aria-selected"), "true")

      assert.isTrue(key(get("d"), " "))
      assert.isTrue(clicked(get("d")))
      assert.isFalse(key(get("d"), "Enter"))
      yield* tick
      assert.deepStrictEqual(clicks, ["b", "c+ctrl", "d"])
      assert.strictEqual(get("c").getAttribute("aria-selected"), "true")

      assert.isFalse(key(get("a"), "Enter"))
      assert.isFalse(key(get("c"), "Enter"))
      assert.isTrue(key(get("e"), "Enter"))
      yield* tick
      assert.deepStrictEqual(clicks, ["b", "c+ctrl", "d", "e"])
      assert.strictEqual(get("e").getAttribute("aria-selected"), "true")
    }).pipe(Effect.scoped))

  it.effect("the indicator is measured against the list, through a scaled list, and again on resize", () =>
    Effect.gen(function*() {
      yield* fakeResizeObserver
      const { get } = yield* mountPage
      const list = get("list")
      const indicator = get("indicator")
      assert.isTrue(indicator.hidden)

      stub(list, {
        offsetWidth: 300,
        offsetHeight: 40,
        scrollWidth: 300,
        scrollHeight: 40,
        getBoundingClientRect: rect(100, 50, 600, 80)
      })
      for (const [id, offsetLeft] of [["a", 0], ["b", 80]] as const) {
        stub(get(id), {
          offsetLeft,
          offsetTop: 4,
          offsetWidth: 60,
          offsetHeight: 32,
          offsetParent: list,
          getBoundingClientRect: rect(
            100 + 2 * (offsetLeft + 0.25),
            58,
            120,
            64
          )
        })
      }
      observers.forEach((observe) => observe())
      yield* tick
      assert.isFalse(indicator.hidden)
      const vars = () =>
        ["left", "right", "top", "bottom", "width", "height"].map((name) =>
          indicator.style.getPropertyValue("--active-tab-" + name)
        )
      assert.deepStrictEqual(vars(), [
        "0.25px",
        "239.75px",
        "4px",
        "4px",
        "60px",
        "32px"
      ])

      clicked(get("b"))
      yield* tick
      assert.deepStrictEqual(vars(), [
        "80.25px",
        "159.75px",
        "4px",
        "4px",
        "60px",
        "32px"
      ])

      stub(get("b"), {
        offsetWidth: 100,
        getBoundingClientRect: rect(400, 58, 200, 64)
      })
      observers.forEach((observe) => observe())
      assert.deepStrictEqual(vars(), [
        "80px",
        "120px",
        "4px",
        "4px",
        "100px",
        "32px"
      ])
    }).pipe(Effect.scoped))
})
