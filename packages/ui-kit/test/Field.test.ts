// @vitest-environment happy-dom
import { Component, View } from "@effect/ui"
import { Checkbox, Field, type FieldProps, Input, Switch } from "@effect/ui-kit"
import { Html, HtmlServer } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

// A field with every part. The control already describes itself with a hint
// of the consumer's own.
const standIn = {
  elements: Html,
  view: (
    f: Component.Headless.Parts<typeof Field>,
    h: View.Helper<never, FieldProps> & View.Tags<Html.Elements, never>
  ) =>
    f.root(h.div).children(
      f.label(h.label).children("Name"),
      f.control(h.input.attr("aria-describedby", "hint")),
      f.description(h.p).children("Visible on your profile"),
      f.error(h.span)?.children("Enter your name")
    )
}

const root = Locator.tag("div")
const label = Locator.tag("label")
const control = Locator.tag("input")
const description = Locator.tag("p")
const error = Locator.tag("span")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: FieldProps, model = { focused: false, touched: false }) => Story.parts(Field, { model, props })
const attrsOf = (builder: View.ElementBuilder<never, never, any, any>) => View.build(builder, []).attrs

describe("Field", () => {
  it.effect("the label names the control, which points at the description and at the error while it shows", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Field, { described: true, invalid: true }, standIn)
      const id = s.get(control).attrs?.id
      assert.isString(id)
      assert.strictEqual(s.get(label).attrs?.for, id)
      const ids = [s.get(description).attrs?.id, s.get(error).attrs?.id]
      assert.strictEqual(new Set([id, ...ids]).size, 3)
      // Next to the consumer's own hint, which stays.
      assert.strictEqual(s.get(control).attrs?.["aria-describedby"], `hint ${ids[0]} ${ids[1]}`)
      assert.strictEqual(s.get(control).attrs?.["aria-invalid"], "true")

      s.props({ described: true, invalid: false })
        .expect(error).toBeAbsent()
      assert.strictEqual(s.get(control).attrs?.["aria-describedby"], `hint ${ids[0]}`)
      assert.isUndefined(s.get(control).attrs?.["aria-invalid"])
    }))

  it.effect("every part shows whether the control has focus and whether it was left", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Field, { described: true, invalid: true }, standIn)
      const shown = (name: string) =>
        [root, label, control, description, error].map((part) => s.get(part).attrs?.[name])
      s.fire(control, "focus")
      assert.deepStrictEqual(shown("data-focused"), ["", "", "", "", ""])
      assert.deepStrictEqual(shown("data-touched"), [undefined, undefined, undefined, undefined, undefined])
      s.fire(control, "blur")
      assert.deepStrictEqual(shown("data-focused"), [undefined, undefined, undefined, undefined, undefined])
      assert.deepStrictEqual(shown("data-touched"), ["", "", "", "", ""])
    }))

  it.effect("a field disabled while its control has focus drops the focus, and a disabled field isn't touched", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Field, { described: true }, standIn)
      const shown = () => [s.get(control).attrs?.["data-focused"], s.get(control).attrs?.["data-touched"]]
      // No blur follows, so the field reports it: hidden at once, and gone
      // from the Model before the field is enabled again.
      s.fire(control, "focus")
        .props({ described: true, disabled: true })
      assert.deepStrictEqual(shown(), [undefined, undefined])
      s.subscription("lostFocus", { _tag: "BlurredControl" })
        .props({ described: true })
      assert.deepStrictEqual(shown(), [undefined, undefined])

      // A blur a disabled control was sent anyway isn't a visit.
      s.props({ described: true, disabled: true })
        .fire(control, "blur")
        .props({ described: true })
      assert.deepStrictEqual(shown(), [undefined, undefined])
    }))

  it("each part keeps the consumer's attributes, but the field's own win, present or absent", () => {
    const owned = [
      "id",
      "for",
      "aria-invalid",
      "data-disabled",
      "data-valid",
      "data-invalid",
      "data-touched",
      "data-dirty",
      "data-filled",
      "data-focused"
    ]
    const stale = <B extends { readonly attr: (name: string, value: string) => any }>(
      builder: B
    ): ReturnType<B["attr"]> => owned.reduce((out, name) => out.attr(name, "stale"), builder.attr("class", "mine"))

    // A field with no state removes every state attribute the consumer set.
    const blank = parts({ described: true })
    assert.deepStrictEqual(attrsOf(blank.root(stale(h.div))), {
      class: "mine",
      id: "stale",
      for: "stale",
      "aria-invalid": "stale"
    })
    const { id: controlId, "aria-describedby": descriptionId } = attrsOf(blank.control(h.input))
    assert.isString(descriptionId)
    assert.deepStrictEqual(attrsOf(blank.label(stale(h.label))), {
      class: "mine",
      id: "stale",
      "aria-invalid": "stale",
      for: controlId
    })
    assert.deepStrictEqual(attrsOf(blank.description(stale(h.p))), {
      class: "mine",
      for: "stale",
      "aria-invalid": "stale",
      id: descriptionId
    })
    // The control's own `disabled` and `data-disabled` are left to it.
    assert.deepStrictEqual(attrsOf(blank.control(stale(h.input).disabled(true))), {
      class: "mine",
      for: "stale",
      "data-disabled": "stale",
      disabled: "",
      id: controlId,
      "aria-describedby": descriptionId
    })
    assert.isUndefined(blank.error(h.div))

    // Every state the field has is on every part.
    const full = parts({ disabled: true, invalid: true, dirty: true, filled: true }, { focused: true, touched: true })
    const state = { "data-invalid": "", "data-touched": "", "data-dirty": "", "data-filled": "", "data-disabled": "" }
    assert.deepStrictEqual(attrsOf(full.root(h.div)), state)
    assert.deepStrictEqual(attrsOf(full.label(h.label)), { ...state, for: controlId })
    // A disabled field hides the error and its `aria-invalid`, and keeps its
    // control disabled whatever the consumer chains after the part.
    assert.isUndefined(full.error(h.div))
    assert.deepStrictEqual(
      attrsOf(full.control(h.textarea).disabled(false).attr("data-disabled", undefined)),
      {
        "data-invalid": "",
        "data-touched": "",
        "data-dirty": "",
        "data-filled": "",
        id: controlId,
        "data-disabled": "",
        disabled: ""
      }
    )
    assert.strictEqual(attrsOf(parts({ invalid: false }).root(h.div))["data-valid"], "")
  })

  it("a disabled field disables another kit control on the same element, and an enabled one leaves it its own", () => {
    const controls = (field: FieldProps, disabled: boolean) => {
      const f = parts(field)
      const checkbox = Story.parts(Checkbox, { model: {}, props: { checked: false, disabled } })
      return [
        Input(h, { element: f.control(h.input), props: { value: "Ada", disabled }, onUpdate: () => undefined }),
        checkbox.root(f.control(h.button)),
        Switch(h, { props: { checked: false, disabled }, view: (s) => s.root(f.control(h.button)) })
      ].map(attrsOf).map((attrs) => [attrs.id, attrs.disabled, attrs["data-disabled"]])
    }
    const id = attrsOf(parts({}).control(h.input)).id
    assert.deepStrictEqual(controls({ disabled: true }, false), [[id, "", ""], [id, "", ""], [id, "", ""]])
    assert.deepStrictEqual(controls({}, true), [[id, "", ""], [id, "", ""], [id, "", ""]])
    assert.deepStrictEqual(controls({}, false), [[id, undefined, undefined], [id, undefined, undefined], [
      id,
      undefined,
      undefined
    ]])
  })

  it.effect("a disabled field submits nothing for its control, and an enabled one submits each value", () =>
    Effect.gen(function*() {
      const Form = Component.define({
        name: "Form",
        props: Schema.Struct({ disabled: Schema.Boolean }),
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_model, h) => {
          const field = (
            key: string,
            draw: (f: Component.Headless.Parts<typeof Field>) => View.Content<never>
          ) => Field(h, { key, props: { disabled: h.props.disabled }, view: draw })
          const props = { checked: true, name: "terms" }
          return h.form(
            field(
              "name",
              (f) =>
                Input(h, { element: f.control(h.input), props: { value: "Ada" }, onUpdate: () => undefined })
                  .attr("name", "name")
            ),
            field("terms", (f) => Checkbox(h, { props, view: (s) => s.root(f.control(h.button)) })),
            field(
              "news",
              (f) => Switch(h, { props: { ...props, name: "news" }, view: (s) => s.root(f.control(h.button)) })
            )
          )
        }
      })
      const submitted = (disabled: boolean) =>
        HtmlServer.renderToHtml(Form, { disabled }).pipe(Effect.map(({ html }) => {
          const form = document.createElement("div")
          form.innerHTML = html
          return [...new FormData(form.querySelector("form")!).entries()]
        }))
      assert.deepStrictEqual(yield* submitted(false), [["name", "Ada"], ["terms", "on"], ["news", "on"]])
      assert.deepStrictEqual(yield* submitted(true), [])
    }))

  it("the label and the control take only their own tags, and a description needs the described prop", () => {
    const f = parts({})
    assert.throws(() => f.label(h.span as any), /a part for <label> was given <span>/)
    assert.throws(
      () => f.control(h.div as any),
      /a part for <input> or <textarea> or <select> or <button> was given <div>/
    )
    assert.throws(() => f.description(h.p), /Field: the description was drawn without the described prop/)
    assert.isUndefined(attrsOf(f.control(h.select))["aria-describedby"])
  })
})
