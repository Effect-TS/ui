import type { Component, Mount } from "@effect/ui"
import { Component as C, UiSchema, View } from "@effect/ui"
import { DirectionProvider, Field, Form, RadioGroup, type RadioGroupProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof RadioGroup>
type H = View.Helper<never, RadioGroupProps> & View.Tags<Html.Elements, never>

const items = [
  { value: "ssd" },
  { value: "hdd", disabled: true },
  { value: "nvme" },
  { value: "tape", readOnly: true }
] as const

const standIn = {
  elements: Html,
  view: (radioGroup: Parts, h: H) =>
    radioGroup.root(h.div).children(
      ...items.map(({ value }) =>
        radioGroup.radio({ element: h.button.attr("aria-label", value), value }).children(
          radioGroup.indicator({ element: h.span.attr("data-dot", value), value })
        )
      )
    )
}

const root = Locator.attr("role", "radiogroup")
const radio = (value: string) => Locator.attr("aria-label", value)
const indicator = (value: string) => Locator.attr("data-dot", value)
const hidden = Locator.tag("input")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const idle = { highlighted: null, settled: null, leaving: [] }
const parts = (props: RadioGroupProps) => Story.parts(RadioGroup, { model: idle, props })

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (s: Rendered, locator: Locator.Locator): Issued =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Issued
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const focusTargets = (
  s: {
    readonly current: {
      readonly pending: ReadonlyArray<{ readonly command: { readonly name: string; readonly args: unknown } }>
    }
    readonly resolve: (command: never, result: never) => unknown
  }
) =>
  s.current.pending.map(({ command }) => {
    s.resolve(command as never, { found: true } as never)
    return command.name + " " + (command.args as { readonly ref: { readonly key: string } }).ref.key
  })

describe("RadioGroup", () => {
  it.effect("clicking picks an unchecked enabled radio, ignores the checked one, and respects disabled and readOnly", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(RadioGroup, { value: "ssd", items: [...items] }, standIn)
      s.expectMount(mountOf(s, indicator("ssd")))
      assert.strictEqual(s.get(radio("ssd")).attrs?.["aria-checked"], "true")
      assert.strictEqual(s.get(radio("ssd")).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(radio("ssd")).attrs?.tabindex, "0")
      assert.strictEqual(s.get(radio("nvme")).attrs?.["aria-checked"], "false")
      assert.strictEqual(s.get(radio("nvme")).attrs?.["data-unchecked"], "")
      assert.strictEqual(s.get(radio("nvme")).attrs?.tabindex, "-1")
      assert.strictEqual(s.get(radio("hdd")).attrs?.disabled, "")
      assert.strictEqual(s.get(radio("hdd")).attrs?.["data-disabled"], "")
      assert.strictEqual(s.get(radio("tape")).attrs?.["data-readonly"], "")

      s.fire(radio("ssd"), "click")
      assert.deepStrictEqual(s.current.emitted, [])

      s.fire(radio("hdd"), "click")
      assert.deepStrictEqual(s.current.emitted, [])

      s.fire(radio("nvme"), "focus")
      assert.strictEqual(s.get(radio("nvme")).attrs?.tabindex, "0")
      assert.strictEqual(s.get(radio("ssd")).attrs?.tabindex, "-1")

      s.fire(radio("tape"), "click")
      assert.deepStrictEqual(s.current.emitted, [])
      assert.strictEqual(s.get(radio("tape")).attrs?.tabindex, "0")

      s.fire(radio("nvme"), "click").emitted({ _tag: "Picked", value: "nvme" })
      assert.strictEqual(s.get(radio("nvme")).attrs?.["aria-checked"], "false")

      s.props({ value: "nvme", items: [...items], disabled: true, required: true, invalid: true })
      s.expectMount(mountOf(s, indicator("nvme")))
      assert.deepInclude(s.get(root).attrs, {
        role: "radiogroup",
        "aria-disabled": "true",
        "aria-required": "true",
        "aria-invalid": "true",
        "data-disabled": "",
        "data-required": ""
      })
      assert.strictEqual(s.get(radio("ssd")).attrs?.disabled, "")
      assert.strictEqual(s.get(radio("ssd")).attrs?.tabindex, "-1")
      s.fire(radio("ssd"), "click")
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("arrow keys navigate wrapping around disabled items, respect readOnly and RTL, and cancel Enter", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(RadioGroup, { value: "ssd", items: [...items] }, standIn)
      s.expectMount(mountOf(s, indicator("ssd")))

      s.fire(radio("ssd"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
        .emitted({ _tag: "Picked", value: "nvme" })
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[nvme]"])

      s.fire(radio("nvme"), "keydown", { key: "ArrowRight" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[tape]"])
      assert.deepStrictEqual(s.current.emitted, [])
      assert.strictEqual(s.get(radio("tape")).attrs?.tabindex, "0")

      s.fire(radio("tape"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[ssd]"])
      assert.deepStrictEqual(s.current.emitted, [])

      s.fire(radio("ssd"), "keydown", { key: "ArrowUp" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[tape]"])

      s.fire(radio("ssd"), "keydown", { key: "Enter" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(s.current.emitted, [])

      for (const init of [{ key: " " }, { key: "Home" }, { key: "End" }, { key: "ArrowDown", ctrl: true }]) {
        s.fire(radio("ssd"), "keydown", init)
          .expectIgnored()
          .expectDefaultPrevented(false)
      }

      s.props({ value: "ssd", items: [...items], readOnly: true })
      s.fire(radio("ssd"), "keydown", { key: "ArrowDown" }).expectDefaultPrevented()
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[nvme]"])
      assert.deepStrictEqual(s.current.emitted, [])
      assert.strictEqual(s.get(radio("nvme")).attrs?.tabindex, "0")

      s.props({ value: "ssd", items: [...items] })
      const syncKey = s.subscriptions.find((key) => key.startsWith("synced"))!
      s.subscription(syncKey, { _tag: "SyncedValue" })
      assert.strictEqual(s.get(radio("ssd")).attrs?.tabindex, "0")
      assert.strictEqual(s.get(radio("nvme")).attrs?.tabindex, "-1")

      s.shared(DirectionProvider, { direction: "rtl" })
      s.fire(radio("ssd"), "keydown", { key: "ArrowLeft" })
        .expectDefaultPrevented()
        .emitted({ _tag: "Picked", value: "nvme" })
      assert.deepStrictEqual(focusTargets(s), ["DomCommand.focus RadioGroupRadio[nvme]"])
    }))

  it.effect("indicator tracks simultaneous enter and exit transitions and respects keepMounted", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(RadioGroup, { value: "ssd", items: [...items] }, standIn)
      assert.isDefined(s.query(indicator("ssd")))
      assert.isUndefined(s.get(indicator("ssd")).attrs?.["data-starting-style"])
      assert.isUndefined(s.get(indicator("ssd")).attrs?.["data-ending-style"])
      assert.isUndefined(s.query(indicator("nvme")))

      s.props({ value: "nvme", items: [...items] })
      assert.strictEqual(s.get(indicator("nvme")).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(indicator("nvme")).attrs?.["data-starting-style"], "")
      assert.strictEqual(s.get(indicator("ssd")).attrs?.["data-unchecked"], "")
      assert.strictEqual(s.get(indicator("ssd")).attrs?.["data-ending-style"], "")

      const ssdMount = mountOf(s, indicator("ssd"))
      const nvmeMount = mountOf(s, indicator("nvme"))
      s.mounted(ssdMount, sent("LeftIndicator", { value: "ssd" }))
      s.mounted(nvmeMount, sent("StartedIndicator", { value: "nvme" }))
      assert.isUndefined(s.get(indicator("nvme")).attrs?.["data-starting-style"])
      assert.strictEqual(s.get(indicator("ssd")).attrs?.["data-ending-style"], "")

      s.mounted(ssdMount, sent("EndedIndicator", { value: "ssd" }))
      assert.isUndefined(s.query(indicator("ssd")))

      const kept = parts({ value: "ssd", items: [...items] })
      const uncheckedKept = kept.indicator({ element: h.span.class("dot"), value: "nvme", keepMounted: true })
      assert.isDefined(uncheckedKept)
      assert.strictEqual(View.build(uncheckedKept!, []).attrs?.["data-unchecked"], "")
    }))

  it("root renders a hidden input only for a named, enabled, picked item", () => {
    const withName = View.build(
      parts({ value: "ssd", items: [...items], name: "storage", form: "prefs" }).root(h.div),
      []
    )
    const inputNode = withName.children[0]
    assert.strictEqual(inputNode?._tag, "Element")
    if (inputNode?._tag === "Element") {
      assert.deepStrictEqual(inputNode.attrs, { type: "hidden", name: "storage", value: "ssd", form: "prefs" })
    }

    for (
      const props of [
        { value: null, items: [...items], name: "storage" },
        { value: "ssd", items: [...items] },
        { value: "ssd", items: [...items], name: "storage", disabled: true },
        { value: "hdd", items: [...items], name: "storage" }
      ] satisfies ReadonlyArray<RadioGroupProps>
    ) {
      assert.strictEqual(View.build(parts(props).root(h.div), []).children.length, 0)
    }
  })

  it("kit attributes win over consumer attributes, and wrong tags or unknown values throw", () => {
    const group = parts({ value: null, items: [{ value: "ssd" }] })
    assert.deepStrictEqual(
      View.build(
        group.root(
          h.div
            .class("group")
            .attr("aria-label", "Storage")
            .attr("role", "group")
            .attr("aria-disabled", "true")
            .attr("aria-readonly", "true")
            .attr("aria-required", "true")
            .attr("aria-invalid", "true")
            .attr("data-disabled", "")
            .attr("data-readonly", "")
            .attr("data-required", "")
        ),
        []
      ).attrs,
      { class: "group", "aria-label": "Storage", role: "radiogroup" }
    )

    const radioBuilder = group.radio({
      element: h.button
        .class("radio")
        .attr("type", "submit")
        .attr("role", "checkbox")
        .attr("aria-checked", "true")
        .attr("aria-disabled", "true")
        .attr("aria-invalid", "true")
        .attr("tabindex", "-1")
        .attr("data-checked", "")
        .attr("data-disabled", "")
        .attr("data-readonly", "")
        .attr("data-required", "")
        .disabled(true),
      value: "ssd"
    })
    assert.deepStrictEqual(View.build(radioBuilder, []).attrs, {
      class: "radio",
      type: "button",
      role: "radio",
      "aria-checked": "false",
      tabindex: "0",
      "data-unchecked": ""
    })

    assert.throws(() => group.root(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => group.radio({ element: h.div as any, value: "ssd" }), /a part for <button> was given <div>/)
    assert.throws(() => group.indicator({ element: h.div as any, value: "ssd" }), /a part for <span> was given <div>/)
    assert.throws(() => group.radio({ element: h.button, value: "missing" }), /no item with value/)
    assert.throws(() => group.indicator({ element: h.span, value: "missing" }), /no item with value/)
  })

  it.effect("integrates with Field and Form, keeping aria-invalid on the radiogroup only", () =>
    Effect.gen(function*() {
      const FormHost = C.define({
        name: "FormHost",
        scoped: false,
        model: Schema.Struct({ invalid: Schema.Boolean }),
        message: UiSchema.TaggedEnum({ Submitted: {} }),
        elements: Html
      }).make({
        init: () => ({ invalid: true }),
        update: { Submitted: (model) => model },
        view: (model, viewH) =>
          Form(viewH, {
            onEmit: { Submitted: () => undefined },
            view: (form) =>
              form.root(viewH.form).children(
                Field(viewH, {
                  props: { invalid: model.invalid },
                  view: (field) =>
                    field.root(viewH.div).children(
                      field.legend(viewH.div).children("Storage"),
                      RadioGroup(viewH, {
                        props: {
                          value: null,
                          items: [{ value: "ssd" }, { value: "nvme" }],
                          disabled: field.disabled,
                          invalid: field.invalid,
                          name: "storage"
                        },
                        onEmit: { Picked: () => undefined },
                        view: (radioGroup) =>
                          radioGroup.root(field.group(viewH.div)).children(
                            radioGroup.radio({
                              element: field.member(viewH.button.attr("aria-label", "ssd")),
                              value: "ssd"
                            }),
                            radioGroup.radio({
                              element: field.member(viewH.button.attr("aria-label", "nvme")),
                              value: "nvme"
                            })
                          )
                      })
                    )
                })
              )
          })
      })

      const s = yield* Scene.make(FormHost, {})
      assert.strictEqual(s.get(root).attrs?.role, "radiogroup")
      assert.strictEqual(s.get(root).attrs?.["aria-invalid"], "true")
      assert.isUndefined(s.get(radio("ssd")).attrs?.["aria-invalid"])
      assert.strictEqual(s.get(radio("ssd")).attrs?.tabindex, "0")
      assert.isUndefined(s.query(hidden))
    }))
})
