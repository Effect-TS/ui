import { type Component, type Mount, View } from "@effect/ui"
import { Collapsible, type CollapsibleProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Collapsible>
type H = View.Helper<never, CollapsibleProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (collapsible: Parts, h: H) =>
    collapsible.root(h.div.class("root")).children(
      collapsible.trigger(h.button.class("trigger")).children("Details"),
      collapsible.panel(h.div.class("panel"))?.children("Content")
    )
}

const root = Locator.attr("class", "root")
const trigger = Locator.attr("class", "trigger")
const panel = Locator.attr("class", "panel")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

type TrackPanel = Mount.Issued<unknown, never, never, unknown>
const tracked = (s: { readonly get: (locator: Locator.Locator) => Locator.Node }): TrackPanel =>
  (s.get(panel) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackPanel

const parts = (props: CollapsibleProps) =>
  Story.parts(Collapsible, {
    model: { mounted: false, started: false, ending: false, size: null, instant: false, openOnLoad: false },
    props
  })

describe("Collapsible", () => {
  it.effect("toggles on press, links aria-controls, ignores disabled, and honors keepMounted and hiddenUntilFound", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Collapsible, { open: false }, standIn)
      assert.isUndefined(s.query(panel))
      assert.deepInclude(s.get(trigger).attrs, { type: "button", "aria-expanded": "false" })
      assert.isUndefined(s.get(trigger).attrs?.["aria-controls"])
      assert.deepInclude(s.get(root).attrs, { "data-closed": "" })

      s.click(trigger).emitted({ _tag: "Toggled", open: true, reason: "trigger-press" })
      assert.isUndefined(s.query(panel))

      s.props({ open: true })
      s.expectMount(tracked(s))
      const id = s.get(panel).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(trigger).attrs, { "aria-expanded": "true", "aria-controls": id, "data-panel-open": "" })
      s.click(trigger).emitted({ _tag: "Toggled", open: false, reason: "trigger-press" })

      const disabled = yield* Scene.make(Collapsible, { open: false, disabled: true, keepMounted: true }, standIn)
      disabled.expectMount(tracked(disabled))
      assert.deepInclude(disabled.get(trigger).attrs, { disabled: "", "data-disabled": "" })
      assert.deepInclude(disabled.get(root).attrs, { "data-disabled": "" })
      assert.deepInclude(disabled.get(panel).attrs, { hidden: "", "data-closed": "", "data-disabled": "" })
      assert.isUndefined(disabled.get(panel).attrs?.["data-starting-style"])
      disabled.click(trigger)
      assert.deepStrictEqual(disabled.current.emitted, [])

      const untilFound = yield* Scene.make(
        Collapsible,
        { open: false, keepMounted: true, hiddenUntilFound: true },
        standIn
      )
      untilFound.expectMount(tracked(untilFound))
      assert.deepInclude(untilFound.get(panel).attrs, { hidden: "until-found", "data-starting-style": "" })
    }))

  it("the root points a trigger built before the panel at the consumer's panel id", () => {
    const collapsible = parts({ open: true })
    const node = View.build(
      collapsible.root(h.div).children(
        h.h3.children(collapsible.trigger(h.button)),
        collapsible.panel(h.div.attr("id", "shipping"))
      ),
      []
    )
    const heading = node.children[0] as View.Element<never>
    assert.strictEqual((heading.children[0] as View.Element<never>).attrs["aria-controls"], "shipping")
  })

  it("the root repoints only its own trigger, not another element controlling the generated id", () => {
    const generated = View.build(parts({ open: true }).panel(h.div)!, []).attrs.id!
    const collapsible = parts({ open: true })
    const node = View.build(
      collapsible.root(h.div).children(
        h.h3.children(collapsible.trigger(h.button)),
        h.button.attr("aria-controls", generated),
        collapsible.panel(h.div.attr("id", "shipping"))
      ),
      []
    )
    const heading = node.children[0] as View.Element<never>
    assert.strictEqual((heading.children[0] as View.Element<never>).attrs["aria-controls"], "shipping")
    assert.strictEqual((node.children[1] as View.Element<never>).attrs["aria-controls"], generated)
  })

  it("each part rejects another tag", () => {
    const collapsible = parts({ open: true })
    assert.strictEqual(View.build(collapsible.root(h.div), []).tag, "div")
    assert.throws(() => collapsible.root(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => collapsible.trigger(h.div as any), /a part for <button> was given <div>/)
    assert.throws(() => collapsible.panel(h.section as any), /a part for <div> was given <section>/)
    assert.throws(() => parts({ open: false }).panel(h.section as any), /a part for <div> was given <section>/)
  })

  it("each part keeps the consumer's attributes and panel id, while its own win, present or absent", () => {
    const open = parts({ open: true })
    const closed = parts({ open: false, disabled: true, keepMounted: true })
    const consumer = (element: typeof h.div) =>
      element
        .class("mine")
        .attr("aria-label", "Shipping")
        .attr("data-open", "x")
        .attr("data-closed", "x")
        .attr("data-disabled", "x")
        .attr("data-starting-style", "x")
        .attr("data-ending-style", "x")

    for (const collapsible of [open, closed]) {
      const isOpen = collapsible === open
      const rootNode = View.build(collapsible.root(consumer(h.div)), [])
      assert.deepInclude(rootNode.attrs, { class: "mine", "aria-label": "Shipping" })
      assert.strictEqual(rootNode.attrs["data-open"], isOpen ? "" : undefined)
      assert.strictEqual(rootNode.attrs["data-closed"], isOpen ? undefined : "")
      assert.strictEqual(rootNode.attrs["data-disabled"], isOpen ? undefined : "")
      assert.isUndefined(rootNode.attrs["data-ending-style"])

      const triggerNode = View.build(
        collapsible.trigger(
          h.button
            .class("mine")
            .attr("aria-label", "Shipping")
            .attr("type", "submit")
            .attr("disabled", "")
            .attr("aria-disabled", "true")
            .attr("aria-expanded", "mixed")
            .attr("aria-controls", "elsewhere")
            .attr("data-panel-open", "x")
            .attr("data-disabled", "x")
            .attr("data-starting-style", "x")
            .attr("data-ending-style", "x")
        ),
        []
      )
      assert.deepInclude(triggerNode.attrs, { class: "mine", "aria-label": "Shipping", type: "button" })
      assert.strictEqual(triggerNode.attrs["aria-expanded"], String(isOpen))
      assert.strictEqual(triggerNode.attrs["data-panel-open"], isOpen ? "" : undefined)
      assert.strictEqual(triggerNode.attrs["data-disabled"], isOpen ? undefined : "")
      assert.strictEqual(triggerNode.attrs.disabled, isOpen ? undefined : "")
      assert.isUndefined(triggerNode.attrs["aria-disabled"])
      assert.isUndefined(triggerNode.attrs["data-ending-style"])
      assert.strictEqual(triggerNode.attrs["data-starting-style"], isOpen ? "" : undefined)
      if (isOpen) {
        const controls = triggerNode.attrs["aria-controls"]?.split(" ") ?? []
        assert.include(controls, "elsewhere")
        assert.strictEqual(controls.length, 2)
      } else {
        assert.strictEqual(triggerNode.attrs["aria-controls"], "elsewhere")
      }

      const panelNode = View.build(
        collapsible.panel(
          consumer(h.div).attr("id", "shipping").attr("hidden", "x").attr(
            "style",
            "color:red;--collapsible-panel-height:1px"
          )
        )!,
        []
      )
      assert.deepInclude(panelNode.attrs, { class: "mine", "aria-label": "Shipping", id: "shipping" })
      assert.strictEqual(panelNode.attrs.hidden, isOpen ? undefined : "")
      assert.strictEqual(panelNode.attrs["data-open"], isOpen ? "" : undefined)
      assert.strictEqual(panelNode.attrs["data-closed"], isOpen ? undefined : "")
      assert.isUndefined(panelNode.attrs["data-ending-style"])
      assert.match(
        panelNode.attrs.style ?? "",
        /^color:red;--collapsible-panel-height:1px;--collapsible-panel-height:auto;/
      )
      if (isOpen) {
        assert.strictEqual(View.build(collapsible.trigger(h.button), []).attrs["aria-controls"], "shipping")
        assert.strictEqual(
          View.build(collapsible.trigger(h.button.attr("aria-controls", "more\u00a0shipping")), [])
            .attrs["aria-controls"],
          "more\u00a0shipping shipping"
        )
        assert.strictEqual(
          View.build(collapsible.trigger(h.button.attr("aria-controls", "\u00a0")), []).attrs["aria-controls"],
          "\u00a0 shipping"
        )
      }
    }
  })
})
