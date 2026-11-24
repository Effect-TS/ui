import type { Component, Mount, View } from "@effect/ui"
import {
  DirectionProvider,
  Tabs,
  TabsEvents,
  type TabsProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"

type Parts = Component.Headless.Parts<typeof Tabs>
type H = View.Helper<never, TabsProps> & View.Tags<Html.Elements, never>

const theirs = {
  "data-orientation": "diagonal",
  "data-activation-direction": "sideways"
}
const consumer = <B extends { attr(name: string, value: string): B }>(
  builder: B,
  attrs: Record<string, string>
) =>
  Object.entries({ ...theirs, ...attrs }).reduce(
    (b, [name, value]) => b.attr(name, value),
    builder
  )
const ownedTab = {
  role: "button",
  id: "mine",
  "aria-selected": "mixed",
  "aria-controls": "elsewhere",
  "aria-disabled": "false",
  tabindex: "4",
  disabled: "",
  "data-active": "x",
  "data-disabled": "x"
}
const ownedPanel = {
  role: "region",
  id: "mine",
  "aria-labelledby": "elsewhere",
  hidden: "until-found",
  inert: "x",
  tabindex: "3",
  "data-index": "9",
  "data-hidden": "x",
  "data-starting-style": "x",
  "data-ending-style": "x"
}

const standIn = {
  elements: Html,
  view: (tabs: Parts, h: H) =>
    tabs.root(consumer(h.div.class("root"), {})).children(
      tabs.list(
        consumer(h.div.class("list"), {
          role: "group",
          "aria-orientation": "vertical"
        })
      ).children(
        tabs.tab({
          element: consumer(h.button.class("tab-a"), {
            ...ownedTab,
            type: "submit"
          }),
          value: "a"
        })
          .children("A"),
        tabs.tab({
          element: consumer(h.button.class("tab-b"), ownedTab),
          value: "b"
        }).children("B"),
        tabs.tab({
          element: consumer(h.a.class("tab-c"), {
            ...ownedTab,
            href: "#c",
            type: "text/html"
          }),
          value: "c"
        })
          .children("C"),
        tabs.tab({
          element: consumer(h.a.class("tab-d"), { ...ownedTab, href: "/d" }),
          value: "d"
        }).children("D"),
        tabs.indicator(
          consumer(h.span.class("indicator"), { role: "img", hidden: "" })
        )
      ),
      tabs.panel({
        element: consumer(h.div.class("panel-a"), ownedPanel),
        value: "a"
      })?.children("Panel A"),
      tabs.panel({
        element: consumer(h.div.class("panel-b"), ownedPanel),
        value: "b"
      })?.children("Panel B"),
      tabs.panel({
        element: consumer(h.section.class("panel-c"), ownedPanel),
        value: "c"
      })?.children("Panel C")
    )
}

const loc = (name: string) => Locator.attr("class", name)
const tabLoc = (value: string) => loc("tab-" + value)
const panelLoc = (value: string) => loc("panel-" + value)
const all = [{ value: "a" }, { value: "b", disabled: true }, { value: "c" }, {
  value: "d"
}]
const props = (extra: Partial<TabsProps> = {}): TabsProps => ({
  value: "a",
  tabs: all,
  ...extra
})

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (scene: Rendered, locator: Locator.Locator): Issued =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Issued
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const makeScene = (initial: TabsProps) =>
  HtmlScene.make(Tabs, initial, standIn).pipe(
    Effect.map((scene) => {
      scene.expectMount(mountOf(scene, loc("list")))
      return scene.query(loc("indicator")) === undefined
        ? scene
        : scene.expectMount(mountOf(scene, loc("indicator")))
    })
  )
type Scene = Effect.Success<ReturnType<typeof makeScene>>

const owns = (
  scene: Scene,
  locator: Locator.Locator,
  expected: Record<string, string | undefined>
) => {
  const attrs = scene.get(locator).attrs ?? {}
  for (const [name, value] of Object.entries(expected)) {
    assert.strictEqual(attrs[name], value, name)
  }
}
const focused = (scene: Scene): ReadonlyArray<string> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true } as never)
    return (command.args as { readonly ref: { readonly key: string } }).ref.key
      .replace(/^TabsTab\[(.*)\]$/, "$1")
  })
const tabindexes = (scene: Scene) =>
  ["a", "b", "c", "d"].map((value) => scene.get(tabLoc(value)).attrs?.tabindex)
const selected = (
  value: string,
  activationDirection: TabsEvents["activationDirection"]
) => TabsEvents.Selected({ value, activationDirection })
const select = (scene: Scene, next: TabsProps) => {
  scene.props(next)
  for (
    const part of [
      panelLoc("a"),
      panelLoc("b"),
      panelLoc("c"),
      loc("indicator")
    ]
  ) {
    const mount = scene.query(part) === undefined
      ? undefined
      : mountOf(scene, part)
    if (mount !== undefined) scene.expectMount(mount)
  }
  return scene.subscription(
    scene.subscriptions.find((key) => key.startsWith("changedValue"))!,
    sent("ChangedValue")
  )
}

describe("Tabs", () => {
  it.effect("the parts carry the roles, ids, ARIA and state, over every value the consumer gave them", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(props())
      const tabA = scene.get(tabLoc("a")).attrs!
      const panelA = scene.get(panelLoc("a")).attrs!
      const state = {
        "data-orientation": "horizontal",
        "data-activation-direction": "none"
      }
      owns(scene, loc("root"), { ...state, class: "root" })
      owns(scene, loc("list"), {
        ...state,
        role: "tablist",
        "aria-orientation": undefined
      })
      assert.notStrictEqual(tabA.id, "mine")
      assert.notStrictEqual(panelA.id, "mine")
      owns(scene, tabLoc("a"), {
        ...state,
        role: "tab",
        type: "button",
        "aria-selected": "true",
        "aria-controls": "elsewhere " + panelA.id,
        "aria-disabled": undefined,
        tabindex: "0",
        disabled: undefined,
        "data-active": "",
        "data-disabled": undefined
      })
      owns(scene, tabLoc("b"), {
        "aria-selected": "false",
        "aria-controls": "elsewhere",
        "aria-disabled": "true",
        tabindex: "-1",
        disabled: undefined,
        "data-active": undefined,
        "data-disabled": ""
      })
      owns(scene, tabLoc("c"), {
        href: "#c",
        type: "text/html",
        "aria-disabled": undefined,
        "data-disabled": undefined
      })
      owns(scene, panelLoc("a"), {
        ...state,
        role: "tabpanel",
        "aria-labelledby": "elsewhere " + tabA.id,
        hidden: undefined,
        inert: undefined,
        tabindex: "0",
        "data-index": "0",
        "data-hidden": undefined,
        "data-starting-style": undefined,
        "data-ending-style": undefined
      })
      owns(scene, loc("indicator"), {
        ...state,
        role: "presentation",
        hidden: ""
      })
      scene.expect(panelLoc("b")).toBeAbsent().expect(panelLoc("c"))
        .toBeAbsent()

      scene.mounted(
        mountOf(scene, loc("indicator")),
        sent("MeasuredActiveTab", { sized: true })
      )
      owns(scene, loc("indicator"), { hidden: undefined })

      scene.props(props({ orientation: "vertical", keepMounted: true }))
      owns(scene, loc("list"), {
        "aria-orientation": "vertical",
        "data-orientation": "vertical"
      })
      owns(scene, panelLoc("b"), {
        hidden: "",
        inert: "",
        "data-hidden": "",
        tabindex: "-1",
        "data-index": "1"
      })
      for (const value of ["b", "c"]) {
        owns(scene, tabLoc(value), {
          "aria-controls": "elsewhere " + scene.get(panelLoc(value)).attrs?.id
        })
      }
      owns(scene, tabLoc("d"), { "aria-controls": "elsewhere" })
      scene.props(
        props({
          tabs: [all[0]!, all[1]!, { value: "c", keepMounted: false }, all[3]!],
          keepMounted: true
        })
      )
      scene.expect(panelLoc("b")).toExist().expect(panelLoc("c")).toBeAbsent()
      owns(scene, tabLoc("c"), { "aria-controls": "elsewhere" })
    }))

  it.effect("the tab stop follows the active tab while focus is elsewhere, and stays put for a disabled one", () =>
    Effect.gen(function*() {
      const order = [{ value: "b", disabled: true }, { value: "a" }, {
        value: "c"
      }, { value: "d" }]
      const none = yield* makeScene(props({ value: null, tabs: order }))
      assert.deepStrictEqual(tabindexes(none), ["0", "-1", "-1", "-1"])
      none.expect(loc("indicator")).toBeAbsent()
      assert.deepStrictEqual(
        tabindexes(yield* makeScene(props({ value: "b", tabs: order }))),
        ["0", "-1", "-1", "-1"]
      )

      const scene = yield* makeScene(props({ value: "c" }))
      assert.deepStrictEqual(tabindexes(scene), ["-1", "-1", "0", "-1"])
      select(scene, props({ value: "b" }))
      assert.deepStrictEqual(scene.current.emitted, [])
      owns(scene, tabLoc("b"), { "aria-selected": "true" })
      assert.deepStrictEqual(tabindexes(scene), ["-1", "-1", "0", "-1"])
      select(scene, props({ value: "a" }))
      assert.deepStrictEqual(tabindexes(scene), ["0", "-1", "-1", "-1"])

      scene.focus(tabLoc("d")).blur(tabLoc("d"))
      assert.deepStrictEqual(tabindexes(scene), ["-1", "-1", "-1", "0"])
      scene.focus(tabLoc("d"))
      select(scene, props({ value: "c" }))
      assert.deepStrictEqual(tabindexes(scene), ["-1", "-1", "-1", "0"])
    }))

  it.effect("the arrow keys, Home and End move focus and the roving tab, through disabled tabs", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(props())
      scene.focus(tabLoc("a"))
      assert.deepStrictEqual(
        focused(
          scene.keydown(tabLoc("a"), "ArrowRight").expectDefaultPrevented()
        ),
        ["b"]
      )
      scene.focus(tabLoc("b"))
      assert.deepStrictEqual(tabindexes(scene), ["-1", "0", "-1", "-1"])
      assert.deepStrictEqual(focused(scene.keydown(tabLoc("b"), "End")), ["d"])
      assert.deepStrictEqual(
        focused(scene.keydown(tabLoc("d"), "ArrowRight")),
        [
          "a"
        ]
      )
      assert.deepStrictEqual(focused(scene.keydown(tabLoc("a"), "ArrowLeft")), [
        "d"
      ])
      assert.deepStrictEqual(focused(scene.keydown(tabLoc("d"), "Home")), ["a"])
      scene.keydown(tabLoc("a"), "ArrowDown").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(tabLoc("a"), "ArrowRight", { alt: true }).expectIgnored()
      scene.blur(tabLoc("a"))
      assert.deepStrictEqual(tabindexes(scene), ["0", "-1", "-1", "-1"])

      scene.props(props({ loopFocus: false }))
      assert.deepStrictEqual(
        focused(scene.keydown(tabLoc("a"), "ArrowLeft")),
        []
      )
      scene.props(props({ orientation: "vertical" }))
      assert.deepStrictEqual(focused(scene.keydown(tabLoc("a"), "ArrowDown")), [
        "b"
      ])
      scene.keydown(tabLoc("a"), "ArrowRight").expectIgnored()
      scene.props(props()).shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(focused(scene.keydown(tabLoc("a"), "ArrowLeft")), [
        "b"
      ])
    }))

  it.effect("a click selects an enabled tab, and a disabled tab never activates", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(props())
      scene.click(tabLoc("c")).emitted(selected("c", "right"))
        .expectDefaultPrevented(false)
      scene.click(tabLoc("a")).expectHandled()
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.click(tabLoc("b")).expectDefaultPrevented()
      assert.deepStrictEqual(scene.current.emitted, [])

      const rtl = (yield* makeScene(props({ value: "c" }))).shared(
        DirectionProvider,
        { direction: "rtl" }
      )
      rtl.click(tabLoc("a")).emitted(selected("a", "right"))
      const vertical = yield* makeScene(
        props({ value: "c", orientation: "vertical" })
      )
      vertical.click(tabLoc("a")).emitted(selected("a", "up"))
    }))

  it.effect("a new value moves the activation direction and plays the panels' transitions", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(props())
      select(scene, props({ value: "c" }))
      for (const part of ["root", "list", "tab-a", "indicator", "panel-c"]) {
        assert.strictEqual(
          scene.get(loc(part)).attrs?.["data-activation-direction"],
          "right"
        )
      }
      owns(scene, panelLoc("c"), { "data-starting-style": "" })
      owns(scene, panelLoc("a"), {
        "data-ending-style": "",
        inert: "",
        hidden: undefined
      })
      owns(scene, tabLoc("a"), {
        "aria-controls": "elsewhere " + scene.get(panelLoc("a")).attrs?.id
      })

      scene.mounted(
        mountOf(scene, panelLoc("c")),
        sent("RenderedFirstFrame", { value: "c" })
      )
      owns(scene, panelLoc("c"), { "data-starting-style": undefined })
      scene.mounted(
        mountOf(scene, panelLoc("a")),
        sent("FinishedTransition", { value: "a" })
      )
      scene.expect(panelLoc("a")).toBeAbsent()
      owns(scene, tabLoc("a"), { "aria-controls": "elsewhere" })
      scene.parts((tabs) =>
        assert.deepStrictEqual([tabs.value, tabs.activationDirection], [
          "c",
          "right"
        ])
      )
    }))

  it.effect("drawing a value that isn't in tabs, or two tabs with one value, fails", () =>
    Effect.gen(function*() {
      const failure = (tabs: TabsProps["tabs"]) =>
        Effect.exit(HtmlScene.make(Tabs, { value: "a", tabs }, standIn)).pipe(
          Effect.map((exit) =>
            Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "rendered"
          )
        )
      assert.include(
        yield* failure([{ value: "a" }, { value: "b" }]),
        "a tab was drawn for \"c\", which isn't in tabs"
      )
      assert.include(
        yield* failure([...all, { value: "a" }]),
        "two tabs have the value \"a\""
      )
    }))
})
