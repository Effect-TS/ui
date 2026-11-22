import { type Component, View } from "@effect/ui"
import { Accordion, AccordionItem, type AccordionItemProps, type AccordionProps, Collapsible } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type ItemParts = Component.Headless.Parts<typeof AccordionItem>
type H = View.Helper<never, AccordionItemProps> & View.Tags<Html.Elements, never>
type Shared = Component.Shared.Value<typeof Accordion>

const standIn = {
  elements: Html,
  view: (item: ItemParts, h: H) =>
    item.root(h.div.class("item")).children(
      item.header(h.h3.class("header")).children(item.trigger(h.button.class("trigger")).children("Question")),
      item.panel(h.div.class("panel"))?.children("Answer")
    )
}

const itemRoot = Locator.attr("class", "item")
const header = Locator.attr("class", "header")
const trigger = Locator.attr("class", "trigger")
const panel = Locator.attr("class", "panel")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const shared = (value: Partial<Shared> = {}): Shared => ({
  value: [],
  disabled: false,
  keepMounted: false,
  hiddenUntilFound: false,
  orientation: "vertical",
  ...value
})

const itemScene = (props: AccordionItemProps, value: Partial<Shared> = {}) =>
  Effect.map(
    Scene.make(AccordionItem, props, standIn),
    (s) => s.shared(Accordion, shared(value))
  )

describe("Accordion", () => {
  it("the root writes its orientation and disabled state over the consumer's", () => {
    const attrsOf = (props: AccordionProps) =>
      View.build(
        Story.parts(Accordion, { model: {}, props }).root(
          h.div.class("mine").attrs({ "data-orientation": "x", "data-disabled": "x" })
        ),
        []
      ).attrs
    assert.deepStrictEqual(attrsOf({ value: [] }), { class: "mine", "data-orientation": "vertical" })
    assert.deepStrictEqual(attrsOf({ value: [], disabled: true, orientation: "horizontal" }), {
      class: "mine",
      "data-orientation": "horizontal",
      "data-disabled": ""
    })
    assert.throws(
      () => Story.parts(Accordion, { model: {}, props: { value: [] } }).root(h.span as any),
      /a part for <div> was given <span>/
    )
  })
})

describe("AccordionItem", () => {
  it.effect("opens from the accordion's value, names its panel by its trigger, and asks the accordion to toggle", () =>
    Effect.gen(function*() {
      const s = yield* itemScene({ value: "a", index: 2 })
      assert.isUndefined(s.query(panel))
      assert.deepInclude(s.get(trigger).attrs, { type: "button", "aria-expanded": "false", "data-index": "2" })
      assert.deepInclude(s.get(itemRoot).attrs, { "data-closed": "", "data-index": "2" })
      assert.deepInclude(s.get(header).attrs, { "data-closed": "", "data-orientation": "vertical" })

      s.childEmit(Collapsible, { _tag: "Toggled", open: true, reason: "trigger-press" })
        .sent(Accordion, { _tag: "ToggledItem", item: "a", open: true, reason: "trigger-press" })
        .emitted({ _tag: "Toggled", open: true, reason: "trigger-press" })

      s.shared(Accordion, shared({ value: ["a"], orientation: "horizontal" }))
      const triggerId = s.get(trigger).attrs?.id
      const panelId = s.get(panel).attrs?.id
      assert.isString(triggerId)
      assert.deepInclude(s.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": panelId,
        "data-panel-open": "",
        "data-orientation": "horizontal"
      })
      assert.deepInclude(s.get(panel).attrs, {
        role: "region",
        "aria-labelledby": triggerId,
        "data-open": "",
        "data-index": "2",
        "data-orientation": "horizontal"
      })
      assert.deepInclude(s.get(header).attrs, { "data-open": "" })
      assert.match(
        s.get(panel).attrs?.style ?? "",
        /--accordion-panel-height:var\(--collapsible-panel-height\);--accordion-panel-width:var\(--collapsible-panel-width\)/
      )

      s.childEmit(Collapsible, { _tag: "Settled", open: true }).emitted({ _tag: "Settled", open: true })
    }))

  it.effect("a disabled item or accordion asks for nothing, and the accordion's mount options reach the panel", () =>
    Effect.gen(function*() {
      const own = yield* itemScene({ value: "a", disabled: true }, { keepMounted: true })
      assert.deepInclude(own.get(trigger).attrs, { disabled: "", "data-disabled": "" })
      assert.deepInclude(own.get(header).attrs, { "data-disabled": "" })
      assert.deepInclude(own.get(panel).attrs, { hidden: "", "data-disabled": "", role: "region" })
      own.childEmit(Collapsible, { _tag: "Toggled", open: true, reason: "trigger-press" })
      assert.deepStrictEqual(own.current.emitted, [])

      const whole = yield* itemScene({ value: "a" }, { disabled: true, hiddenUntilFound: true })
      assert.deepInclude(whole.get(trigger).attrs, { disabled: "" })
      assert.deepInclude(whole.get(panel).attrs, { hidden: "until-found" })
      whole.childEmit(Collapsible, { _tag: "Toggled", open: true, reason: "find-in-page" })
      assert.deepStrictEqual(whole.current.emitted, [])

      const overridden = yield* itemScene({ value: "a", keepMounted: false, hiddenUntilFound: false }, {
        keepMounted: true,
        hiddenUntilFound: true
      })
      assert.isUndefined(overridden.query(panel))
    }))

  it.effect("each part rejects another tag, and the header takes any heading", () =>
    Effect.gen(function*() {
      const s = yield* itemScene({ value: "a" }, { value: ["a"] })
      s.parts((item) => {
        assert.strictEqual(View.build(item.header(h.h2), []).tag, "h2")
        assert.strictEqual(View.build(item.header(h.h6), []).tag, "h6")
        assert.throws(() => item.root(h.span as any), /a part for <div> was given <span>/)
        assert.throws(() => item.header(h.div as any), /a part for <h1>/)
        assert.throws(() => item.trigger(h.div as any), /a part for <button> was given <div>/)
        assert.throws(() => item.panel(h.section as any), /a part for <div> was given <section>/)
      })
    }))

  it.effect("each part keeps the consumer's attributes and ids, while its own win, present or absent", () =>
    Effect.gen(function*() {
      const s = yield* itemScene({ value: "a" }, { value: ["a"] })
      s.parts((item) => {
        const stale = {
          "data-open": "x",
          "data-closed": "x",
          "data-disabled": "x",
          "data-index": "x",
          "data-orientation": "x"
        }
        const rootAttrs = View.build(item.root(h.div.class("mine").attrs(stale)), []).attrs
        assert.deepInclude(rootAttrs, { class: "mine", "data-open": "", "data-orientation": "vertical" })
        assert.isUndefined(rootAttrs["data-closed"])
        assert.isUndefined(rootAttrs["data-disabled"])
        assert.isUndefined(rootAttrs["data-index"])

        const headerAttrs = View.build(item.header(h.h3.class("mine").attrs(stale)), []).attrs
        assert.deepStrictEqual(headerAttrs, { class: "mine", "data-open": "", "data-orientation": "vertical" })

        const triggerNode = View.build(
          item.trigger(h.button.class("mine").attrs({ ...stale, id: "question", "aria-expanded": "false" })),
          []
        )
        assert.deepInclude(triggerNode.attrs, { class: "mine", id: "question", "aria-expanded": "true" })
        assert.isUndefined(triggerNode.attrs["data-index"])

        const panelNode = View.build(
          item.panel(
            h.div.class("mine").attrs({
              ...stale,
              id: "answer",
              role: "note",
              "aria-labelledby": "elsewhere",
              style: "color:red;--accordion-panel-height:1px"
            })
          )!,
          []
        )
        assert.deepInclude(panelNode.attrs, {
          class: "mine",
          id: "answer",
          role: "region",
          "aria-labelledby": "question"
        })
        assert.isUndefined(panelNode.attrs["data-index"])
        assert.match(
          panelNode.attrs.style ?? "",
          /^color:red;--accordion-panel-height:1px;--accordion-panel-height:var/
        )
      })
    }))

  it.effect("a panel drawn without a trigger isn't labelled", () =>
    Effect.gen(function*() {
      const s = yield* itemScene({ value: "a" }, { value: ["a"] })
      s.parts((item) => {
        assert.isUndefined(View.build(item.panel(h.div)!, []).attrs["aria-labelledby"])
      })
    }))
})
