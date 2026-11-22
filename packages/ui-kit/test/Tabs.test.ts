import type { Component, Mount, View } from "@effect/ui"
import { DirectionProvider, Tabs, TabsEvents, type TabsProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"

type Parts = Component.Headless.Parts<typeof Tabs>
type H = View.Helper<never, TabsProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (tabs: Parts, h: H) =>
    tabs.root(h.div.class("root").attr("data-orientation", "diagonal")).children(
      tabs.list(h.div.class("list").attr("role", "group")).children(
        tabs.tab({ element: h.button.class("tab-a").attr("tabindex", "4"), value: "a" }).children("A"),
        tabs.tab({ element: h.button.class("tab-b").attr("disabled", ""), value: "b" }).children("B"),
        tabs.tab({ element: h.a.class("tab-c").attr("href", "#c").attr("type", "text/html"), value: "c" })
          .children("C"),
        tabs.indicator(h.span.class("indicator"))
      ),
      tabs.panel({ element: h.div.class("panel-a").attr("hidden", ""), value: "a" })?.children("Panel A"),
      tabs.panel({ element: h.div.class("panel-b"), value: "b" })?.children("Panel B"),
      tabs.panel({ element: h.section.class("panel-c"), value: "c" })?.children("Panel C")
    )
}

const loc = (name: string) => Locator.attr("class", name)
const tabLoc = (value: string) => loc("tab-" + value)
const panelLoc = (value: string) => loc("panel-" + value)
const all = [{ value: "a" }, { value: "b", disabled: true }, { value: "c" }]
const props = (extra: Partial<TabsProps> = {}): TabsProps => ({ value: "a", tabs: all, ...extra })

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (s: Rendered, locator: Locator.Locator): Issued =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Issued
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const scene = (initial: TabsProps) =>
  HtmlScene.make(Tabs, initial, standIn).pipe(
    Effect.map((s) => {
      s.expectMount(mountOf(s, loc("list")))
      return s.query(loc("indicator")) === undefined ? s : s.expectMount(mountOf(s, loc("indicator")))
    })
  )
type Scene = Effect.Success<ReturnType<typeof scene>>

const focused = (s: Scene): ReadonlyArray<string> =>
  s.current.pending.map(({ command }) => {
    s.resolve(command as never, { found: true } as never)
    return (command.args as { readonly ref: { readonly key: string } }).ref.key.replace(/^TabsTab\[(.*)\]$/, "$1")
  })
const tabindexes = (s: Scene) => ["a", "b", "c"].map((value) => s.get(tabLoc(value)).attrs?.tabindex)
const selected = (value: string, activationDirection: TabsEvents["activationDirection"]) =>
  TabsEvents.Selected({ value, activationDirection })
const changedValue = (s: Scene) =>
  s.subscription(s.subscriptions.find((key) => key.startsWith("changedValue"))!, sent("ChangedValue"))

describe("Tabs", () => {
  it.effect("the parts carry the roles, ids, ARIA and state, over the consumer's attributes", () =>
    Effect.gen(function*() {
      const s = yield* scene(props())
      const a = s.get(tabLoc("a")).attrs!
      const panel = s.get(panelLoc("a")).attrs!
      assert.deepInclude(s.get(loc("root")).attrs, {
        "data-orientation": "horizontal",
        "data-activation-direction": "none"
      })
      assert.deepInclude(s.get(loc("list")).attrs, { role: "tablist" })
      assert.isUndefined(s.get(loc("list")).attrs?.["aria-orientation"])
      assert.deepInclude(a, {
        role: "tab",
        type: "button",
        "aria-selected": "true",
        "aria-controls": panel.id,
        tabindex: "0",
        "data-active": ""
      })
      assert.deepInclude(panel, { role: "tabpanel", "aria-labelledby": a.id, tabindex: "0", "data-index": "0" })
      assert.isUndefined(panel.hidden)
      assert.deepInclude(s.get(tabLoc("b")).attrs, {
        "aria-selected": "false",
        "aria-disabled": "true",
        "data-disabled": "",
        tabindex: "-1"
      })
      assert.isUndefined(s.get(tabLoc("b")).attrs?.disabled)
      assert.isUndefined(s.get(tabLoc("b")).attrs?.["aria-controls"])
      assert.deepInclude(s.get(tabLoc("c")).attrs, { href: "#c", type: "text/html" })
      assert.deepInclude(s.get(loc("indicator")).attrs, { role: "presentation", hidden: "" })
      s.expect(panelLoc("b")).toBeAbsent().expect(panelLoc("c")).toBeAbsent()

      s.mounted(mountOf(s, loc("indicator")), sent("MeasuredActiveTab", { sized: true }))
      assert.isUndefined(s.get(loc("indicator")).attrs?.hidden)

      s.props(props({ orientation: "vertical", keepMounted: true }))
      assert.deepInclude(s.get(loc("list")).attrs, { "aria-orientation": "vertical", "data-orientation": "vertical" })
      assert.deepInclude(s.get(panelLoc("c")).attrs, { hidden: "", inert: "", "data-hidden": "", tabindex: "-1" })
      assert.strictEqual(s.get(tabLoc("c")).attrs?.["aria-controls"], s.get(panelLoc("c")).attrs?.id)
      s.props(props({ tabs: [all[0]!, all[1]!, { value: "c", keepMounted: false }], keepMounted: true }))
      s.expect(panelLoc("b")).toExist().expect(panelLoc("c")).toBeAbsent()
    }))

  it.effect("the active tab, or the first enabled one, is the one in the page's Tab order", () =>
    Effect.gen(function*() {
      const order = [{ value: "b", disabled: true }, { value: "a" }, { value: "c" }]
      const none = yield* scene(props({ value: null, tabs: order }))
      assert.deepStrictEqual(tabindexes(none), ["0", "-1", "-1"])
      none.expect(loc("indicator")).toBeAbsent()
      assert.deepStrictEqual(tabindexes(yield* scene(props({ value: "b", tabs: order }))), ["0", "-1", "-1"])
      assert.deepStrictEqual(tabindexes(yield* scene(props({ value: "c" }))), ["-1", "-1", "0"])
    }))

  it.effect("the arrow keys, Home and End move focus and the roving tab, through disabled tabs", () =>
    Effect.gen(function*() {
      const s = yield* scene(props())
      s.focus(tabLoc("a"))
      assert.deepStrictEqual(focused(s.keydown(tabLoc("a"), "ArrowRight").expectDefaultPrevented()), ["b"])
      s.focus(tabLoc("b"))
      assert.deepStrictEqual(tabindexes(s), ["-1", "0", "-1"])
      assert.deepStrictEqual(focused(s.keydown(tabLoc("b"), "End")), ["c"])
      assert.deepStrictEqual(focused(s.keydown(tabLoc("c"), "ArrowRight")), ["a"])
      assert.deepStrictEqual(focused(s.keydown(tabLoc("a"), "ArrowLeft")), ["c"])
      assert.deepStrictEqual(focused(s.keydown(tabLoc("c"), "Home")), ["a"])
      s.keydown(tabLoc("a"), "ArrowDown").expectIgnored().expectDefaultPrevented(false)
      s.keydown(tabLoc("a"), "ArrowRight", { alt: true }).expectIgnored()
      s.blur(tabLoc("a"))
      assert.deepStrictEqual(tabindexes(s), ["0", "-1", "-1"])
      s.expect(tabLoc("a")).toHaveCount(1)

      s.props(props({ loopFocus: false }))
      assert.deepStrictEqual(focused(s.keydown(tabLoc("a"), "ArrowLeft")), [])
      s.props(props({ orientation: "vertical" }))
      assert.deepStrictEqual(focused(s.keydown(tabLoc("a"), "ArrowDown")), ["b"])
      s.keydown(tabLoc("a"), "ArrowRight").expectIgnored()
      s.props(props()).shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(focused(s.keydown(tabLoc("a"), "ArrowLeft")), ["b"])
    }))

  it.effect("a click selects an enabled tab, and a disabled tab never activates", () =>
    Effect.gen(function*() {
      const s = yield* scene(props())
      s.click(tabLoc("c")).emitted(selected("c", "right")).expectDefaultPrevented(false)
      s.click(tabLoc("a")).expectHandled()
      assert.deepStrictEqual(s.current.emitted, [])
      s.click(tabLoc("b")).expectDefaultPrevented()
      assert.deepStrictEqual(s.current.emitted, [])

      const rtl = (yield* scene(props({ value: "c" }))).shared(DirectionProvider, { direction: "rtl" })
      rtl.click(tabLoc("a")).emitted(selected("a", "right"))
      const vertical = yield* scene(props({ value: "c", orientation: "vertical" }))
      vertical.click(tabLoc("a")).emitted(selected("a", "up"))
    }))

  it.effect("with activateOnFocus, focus selects, unless a secondary button pressed the tab", () =>
    Effect.gen(function*() {
      const s = yield* scene(props({ activateOnFocus: true }))
      s.focus(tabLoc("c")).emitted(selected("c", "right"))
      s.focus(tabLoc("b"))
      assert.deepStrictEqual(s.current.emitted, [])
      s.fire(tabLoc("c"), "mousedown", { button: 2 }).focus(tabLoc("c"))
      assert.deepStrictEqual(s.current.emitted, [])
      s.fireDocument("mouseup").fire(tabLoc("c"), "mousedown", { button: 0 }).focus(tabLoc("c"))
        .emitted(selected("c", "right"))
    }))

  it.effect("a new value moves the activation direction and plays the panels' transitions", () =>
    Effect.gen(function*() {
      const s = yield* scene(props())
      s.props(props({ value: "c" }))
      const starting = mountOf(s, panelLoc("c"))
      const ending = mountOf(s, panelLoc("a"))
      changedValue(s.expectMount(starting).expectMount(ending).expectMount(mountOf(s, loc("indicator"))))
      for (const part of ["root", "list", "tab-a", "indicator", "panel-c"]) {
        assert.strictEqual(s.get(loc(part)).attrs?.["data-activation-direction"], "right")
      }
      assert.deepInclude(s.get(panelLoc("c")).attrs, { "data-starting-style": "" })
      assert.deepInclude(s.get(panelLoc("a")).attrs, { "data-ending-style": "", inert: "" })
      assert.isUndefined(s.get(panelLoc("a")).attrs?.hidden)
      assert.strictEqual(s.get(tabLoc("a")).attrs?.["aria-controls"], s.get(panelLoc("a")).attrs?.id)

      s.mounted(starting, sent("RenderedFirstFrame", { value: "c" }))
      assert.isUndefined(s.get(panelLoc("c")).attrs?.["data-starting-style"])
      s.mounted(ending, sent("FinishedTransition", { value: "a" }))
      s.expect(panelLoc("a")).toBeAbsent()
      assert.isUndefined(s.get(tabLoc("a")).attrs?.["aria-controls"])
      s.parts((tabs) => assert.deepStrictEqual([tabs.value, tabs.activationDirection], ["c", "right"]))
    }))

  it.effect("drawing a value that isn't in tabs, or two tabs with one value, fails", () =>
    Effect.gen(function*() {
      const failure = (tabs: TabsProps["tabs"]) =>
        Effect.exit(HtmlScene.make(Tabs, { value: "a", tabs }, standIn)).pipe(
          Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "rendered")
        )
      assert.include(yield* failure([{ value: "a" }, { value: "b" }]), "a tab was drawn for \"c\", which isn't in tabs")
      assert.include(yield* failure([...all, { value: "a" }]), "two tabs have the value \"a\"")
    }))
})
