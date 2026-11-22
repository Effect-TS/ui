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
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): TrackPanel =>
  (s.get(panel) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackPanel
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never
const size = { size: { height: 120, width: 200 } }

const partsOf = (s: { readonly parts: (f: (collapsible: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((collapsible) => {
    parts = collapsible
  })
  return parts!
}

const parts = (props: CollapsibleProps) =>
  Story.parts(Collapsible, {
    model: { mounted: false, started: false, ending: false, size: null, instant: false, openOnLoad: false },
    props
  })

describe("Collapsible", () => {
  it.effect("a trigger press asks for the other value, and the trigger points at the open panel", () =>
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
    }))

  it.effect("a disabled collapsible reports neither a press nor a find-in-page match", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Collapsible, { open: false, disabled: true, hiddenUntilFound: true }, standIn)
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(trigger).attrs, { disabled: "", "data-disabled": "" })
      assert.deepInclude(s.get(root).attrs, { "data-disabled": "" })
      assert.deepInclude(s.get(panel).attrs, { "data-disabled": "" })
      s.click(trigger)
      assert.deepStrictEqual(s.current.emitted, [])
      s.mounted(tracked(s), sent("MatchedFind"))
      assert.deepStrictEqual(s.current.emitted, [])
      assert.isNull(partsOf(s).transitionStatus)
    }))

  it.effect("an open writes the measured size, drops the starting style a frame later, and settles at auto", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Collapsible, { open: false }, standIn)
      s.props({ open: true })
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      for (const part of [root, panel]) {
        assert.deepInclude(s.get(part).attrs, { "data-open": "", "data-starting-style": "" })
      }
      assert.deepInclude(s.get(trigger).attrs, { "data-starting-style": "" })
      assert.strictEqual(
        s.get(panel).attrs?.style,
        "--collapsible-panel-height:auto;--collapsible-panel-width:auto;animation-name:none"
      )
      s.mounted(tracked(s), sent("ShowedPanel")).expectMount(tracked(s))
      s.mounted(tracked(s), sent("MeasuredPanel", size)).expectMount(tracked(s))
      assert.strictEqual(s.get(panel).attrs?.style, "--collapsible-panel-height:120px;--collapsible-panel-width:200px")
      s.mounted(tracked(s), sent("RenderedFirstFrame")).expectMount(tracked(s))
      assert.isNull(partsOf(s).transitionStatus)
      assert.isUndefined(s.get(panel).attrs?.["data-starting-style"])
      s.mounted(tracked(s), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })
      assert.strictEqual(s.get(panel).attrs?.style, "--collapsible-panel-height:auto;--collapsible-panel-width:auto")
    }))

  it.effect("a close writes the measured size before the ending style, and waits for holdExit to settle", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Collapsible, { open: true }, standIn)
      s.expectMount(tracked(s))
      assert.isNull(partsOf(s).transitionStatus)
      assert.isTrue(partsOf(s).mounted)
      s.props({ open: false, holdExit: true })
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(panel).attrs, { "data-closed": "" })
      assert.isUndefined(s.get(panel).attrs?.["data-ending-style"])
      assert.isUndefined(s.get(panel).attrs?.hidden)
      s.mounted(tracked(s), sent("MeasuredPanel", size)).expectMount(tracked(s))
      assert.strictEqual(s.get(panel).attrs?.style, "--collapsible-panel-height:120px;--collapsible-panel-width:200px")
      assert.isNull(partsOf(s).transitionStatus)
      s.mounted(tracked(s), sent("RenderedSize")).expectMount(tracked(s))
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      for (const part of [root, trigger, panel]) assert.deepInclude(s.get(part).attrs, { "data-ending-style": "" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.props({ open: false, holdExit: false })
      s.expectMount(tracked(s))
      s.mounted(tracked(s), sent("FinishedTransition", { open: true }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.mounted(tracked(s), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isUndefined(s.query(panel))
      assert.isFalse(partsOf(s).mounted)
    }))

  it.effect("a kept panel stays hidden, and one hidden until found opens at once on a match", () =>
    Effect.gen(function*() {
      const kept = yield* Scene.make(Collapsible, { open: false, keepMounted: true }, standIn)
      kept.expectMount(tracked(kept))
      assert.deepInclude(kept.get(panel).attrs, { hidden: "", "data-closed": "" })
      assert.isUndefined(kept.get(panel).attrs?.["data-starting-style"])

      const s = yield* Scene.make(Collapsible, { open: false, keepMounted: true, hiddenUntilFound: true }, standIn)
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(panel).attrs, { hidden: "until-found", "data-starting-style": "" })
      s.mounted(tracked(s), sent("MatchedFind"))
        .emitted({ _tag: "Toggled", open: true, reason: "find-in-page" })
      s.expectMount(tracked(s))
      s.mounted(tracked(s), sent("StayedHidden")).expectMount(tracked(s))
      s.props({ open: true, keepMounted: true, hiddenUntilFound: true })
      s.expectMount(tracked(s))
      assert.strictEqual(partsOf(s).transitionStatus, "starting")

      s.props({ open: false, keepMounted: true, hiddenUntilFound: true })
      s.expectMount(tracked(s))
      s.mounted(tracked(s), sent("MatchedFind"))
        .emitted({ _tag: "Toggled", open: true, reason: "find-in-page" })
      s.expectMount(tracked(s))
      s.props({ open: true, keepMounted: true, hiddenUntilFound: true })
      s.expectMount(tracked(s))
      assert.isNull(partsOf(s).transitionStatus)
      assert.isUndefined(s.get(panel).attrs?.hidden)
      assert.isUndefined(s.get(panel).attrs?.["data-starting-style"])
      assert.strictEqual(
        s.get(panel).attrs?.style,
        "--collapsible-panel-height:auto;--collapsible-panel-width:auto;transition-duration:0s;animation-duration:0s"
      )
      s.mounted(tracked(s), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })
      assert.strictEqual(s.get(panel).attrs?.style, "--collapsible-panel-height:auto;--collapsible-panel-width:auto")
    }))

  it("each part rejects another tag", () => {
    const collapsible = parts({ open: true })
    assert.strictEqual(View.build(collapsible.root(h.div), []).tag, "div")
    assert.throws(() => collapsible.root(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => collapsible.trigger(h.div as any), /a part for <button> was given <div>/)
    assert.throws(() => collapsible.panel(h.section as any), /a part for <div> was given <section>/)
    const closed = parts({ open: false })
    assert.throws(() => closed.panel(h.section as any), /a part for <div> was given <section>/)
  })

  it("each part keeps the consumer's attributes, but its own win, present or absent", () => {
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
      if (!isOpen) assert.isUndefined(triggerNode.attrs["aria-controls"])

      const panelNode = View.build(
        collapsible.panel(
          consumer(h.div).attr("hidden", "x").attr("style", "color:red;--collapsible-panel-height:1px")
        )!,
        []
      )
      assert.deepInclude(panelNode.attrs, { class: "mine", "aria-label": "Shipping" })
      assert.strictEqual(panelNode.attrs.hidden, isOpen ? undefined : "")
      assert.strictEqual(panelNode.attrs["data-open"], isOpen ? "" : undefined)
      assert.strictEqual(panelNode.attrs["data-closed"], isOpen ? undefined : "")
      assert.isUndefined(panelNode.attrs["data-ending-style"])
      assert.match(
        panelNode.attrs.style ?? "",
        /^color:red;--collapsible-panel-height:1px;--collapsible-panel-height:auto;/
      )
    }
  })

  it("the panel keeps the consumer's id, and the trigger points at it", () => {
    const collapsible = parts({ open: true })
    const panelNode = View.build(collapsible.panel(h.div.attr("id", "shipping"))!, [])
    assert.strictEqual(panelNode.attrs.id, "shipping")
    assert.strictEqual(View.build(collapsible.trigger(h.button), []).attrs["aria-controls"], "shipping")
  })
})
