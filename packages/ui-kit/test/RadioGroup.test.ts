import type { Component, Mount } from "@effect/ui"
import { Component as C, View } from "@effect/ui"
import {
  DirectionProvider,
  Field,
  RadioGroup,
  type RadioGroupProps
} from "@effect/ui-kit"
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
]

const standIn = {
  elements: Html,
  view: (radioGroup: Parts, h: H) =>
    radioGroup.root(h.div).children(
      ...items.map(({ value }) =>
        radioGroup.radio({ element: h.button.attr("aria-label", value), value })
          .children(
            radioGroup.indicator({
              element: h.span.attr("data-dot", value),
              value
            })
          )
      )
    )
}

const root = Locator.attr("role", "radiogroup")
const radio = (value: string) => Locator.attr("aria-label", value)
const indicator = (value: string) => Locator.attr("data-dot", value)
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: RadioGroupProps) =>
  Story.parts(RadioGroup, {
    model: {
      highlighted: null,
      current: props.value,
      settled: props.value,
      mounted: [],
      leaving: []
    },
    props
  })

type Issued = Mount.Issued<unknown, never, never, unknown>
const mountOf = (
  scene: { readonly get: (locator: Locator.Locator) => Locator.Node },
  locator: Locator.Locator
): Issued =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Issued

const openScene = (props: RadioGroupProps = { value: "ssd", items }) =>
  HtmlScene.make(RadioGroup, props, standIn).pipe(
    Effect.tap((scene) =>
      Effect.sync(() => {
        scene.expectMount(mountOf(scene, root))
        if (props.value !== null) {
          scene.expectMount(mountOf(scene, indicator(props.value)))
        }
      })
    )
  )

const expectFocus = (
  scene: {
    readonly current: {
      readonly pending: ReadonlyArray<
        { readonly command: { readonly name: string; readonly args: unknown } }
      >
    }
    readonly resolve: (command: never, result: never) => unknown
  },
  value: string
) => {
  const targets = scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true } as never)
    return command.name + " " +
      (command.args as { readonly ref: { readonly key: string } }).ref.key
  })
  assert.deepStrictEqual(targets, [
    "HtmlCommand.focus RadioGroupRadio[" + value + "]"
  ])
}

describe("RadioGroup", () => {
  it.effect("clicking picks an unchecked enabled radio, ignores the checked one, and respects disabled and readOnly", () =>
    Effect.gen(function*() {
      const scene = yield* openScene()
      assert.deepInclude(scene.get(radio("ssd")).attrs, {
        "aria-checked": "true",
        "data-checked": "",
        tabindex: "0"
      })
      assert.deepInclude(scene.get(radio("nvme")).attrs, {
        "aria-checked": "false",
        "data-unchecked": "",
        tabindex: "-1"
      })
      assert.deepInclude(scene.get(radio("hdd")).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.strictEqual(scene.get(radio("tape")).attrs?.["data-readonly"], "")

      scene.fire(radio("ssd"), "click")
      scene.fire(radio("hdd"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.fire(radio("nvme"), "focus")
      assert.strictEqual(scene.get(radio("nvme")).attrs?.tabindex, "0")
      assert.strictEqual(scene.get(radio("ssd")).attrs?.tabindex, "-1")

      scene.fire(radio("tape"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.strictEqual(scene.get(radio("tape")).attrs?.tabindex, "0")

      scene.fire(radio("nvme"), "click").emitted({
        _tag: "Picked",
        value: "nvme"
      })
      assert.strictEqual(
        scene.get(radio("nvme")).attrs?.["aria-checked"],
        "false"
      )

      scene.props({
        value: "nvme",
        items,
        disabled: true,
        required: true,
        invalid: true
      })
      scene.expectMount(mountOf(scene, indicator("nvme")))
      assert.deepInclude(scene.get(root).attrs, {
        role: "radiogroup",
        "aria-disabled": "true",
        "aria-required": "true",
        "aria-invalid": "true",
        "data-disabled": "",
        "data-required": ""
      })
      assert.deepInclude(scene.get(radio("ssd")).attrs, {
        disabled: "",
        tabindex: "-1"
      })
      scene.fire(radio("ssd"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("arrow keys navigate wrapping around disabled items, pick nothing from or onto a read-only radio, follow RTL, and cancel Enter", () =>
    Effect.gen(function*() {
      const scene = yield* openScene()

      scene.fire(radio("ssd"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
        .emitted({ _tag: "Picked", value: "nvme" })
      expectFocus(scene, "nvme")

      scene.fire(radio("nvme"), "keydown", { key: "ArrowRight" })
        .expectDefaultPrevented()
      expectFocus(scene, "tape")
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.strictEqual(scene.get(radio("tape")).attrs?.tabindex, "0")

      scene.fire(radio("tape"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
      expectFocus(scene, "ssd")
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.fire(radio("ssd"), "keydown", { key: "ArrowUp" })
        .expectDefaultPrevented()
      expectFocus(scene, "tape")

      scene.fire(radio("ssd"), "keydown", { key: "Enter" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(scene.current.emitted, [])

      for (
        const init of [{ key: " " }, { key: "Home" }, { key: "End" }, {
          key: "ArrowDown",
          ctrl: true
        }]
      ) {
        scene.fire(radio("ssd"), "keydown", init).expectIgnored()
          .expectDefaultPrevented(false)
      }

      scene.props({ value: "ssd", items, readOnly: true })
      scene.fire(radio("ssd"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
      expectFocus(scene, "nvme")
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.strictEqual(scene.get(radio("nvme")).attrs?.tabindex, "0")

      scene.props({ value: "nvme", items })
      scene.expectMount(mountOf(scene, indicator("nvme")))
      scene.fire(radio("tape"), "keydown", { key: "ArrowDown" })
        .expectDefaultPrevented()
      expectFocus(scene, "ssd")
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.props({ value: "ssd", items })
      scene.expectMount(mountOf(scene, indicator("ssd")))
      scene.shared(DirectionProvider, { direction: "rtl" })
      scene.fire(radio("ssd"), "keydown", { key: "ArrowLeft" })
        .expectDefaultPrevented()
        .emitted({ _tag: "Picked", value: "nvme" })
      expectFocus(scene, "nvme")
    }))

  it("root renders a hidden input only for a named, enabled, picked item", () => {
    const inputNode = View.build(
      parts({ value: "ssd", items, name: "storage", form: "prefs" }).root(
        h.div
      ),
      []
    ).children[0]
    assert.strictEqual(inputNode?._tag, "Element")
    if (inputNode?._tag === "Element") {
      assert.deepStrictEqual(inputNode.attrs, {
        type: "hidden",
        name: "storage",
        value: "ssd",
        form: "prefs"
      })
    }

    for (
      const props of [
        { value: null, items, name: "storage" },
        { value: "ssd", items },
        { value: "ssd", items, name: "storage", disabled: true },
        { value: "hdd", items, name: "storage" }
      ] satisfies ReadonlyArray<RadioGroupProps>
    ) {
      assert.strictEqual(
        View.build(parts(props).root(h.div), []).children.length,
        0
      )
    }
  })

  it("kit attributes win over consumer attributes, keepMounted keeps unchecked indicators, and wrong tags or unknown values throw", () => {
    const group = parts({ value: null, items: [{ value: "ssd" }] })
    assert.deepStrictEqual(
      View.build(
        group.root(
          h.div
            .class("group")
            .attrs({
              "aria-label": "Storage",
              role: "group",
              "aria-disabled": "true",
              "aria-readonly": "true",
              "aria-required": "true",
              "aria-invalid": "true",
              "data-disabled": "",
              "data-readonly": "",
              "data-required": ""
            })
        ),
        []
      ).attrs,
      { class: "group", "aria-label": "Storage", role: "radiogroup" }
    )

    assert.deepStrictEqual(
      View.build(
        group.radio({
          element: h.button
            .class("radio")
            .attrs({
              type: "submit",
              role: "checkbox",
              "aria-checked": "true",
              "aria-disabled": "true",
              "aria-invalid": "true",
              tabindex: "-1",
              "data-checked": "",
              "data-disabled": "",
              "data-readonly": "",
              "data-required": ""
            })
            .disabled(true),
          value: "ssd"
        }),
        []
      ).attrs,
      {
        class: "radio",
        type: "button",
        role: "radio",
        "aria-checked": "false",
        tabindex: "0",
        "data-unchecked": ""
      }
    )

    assert.isUndefined(group.indicator({ element: h.span, value: "ssd" }))
    const kept = View.build(
      group.indicator({ element: h.span, value: "ssd", keepMounted: true })!,
      []
    ).attrs
    assert.strictEqual(kept?.["data-unchecked"], "")
    assert.strictEqual(kept?.["aria-hidden"], "true")

    assert.throws(
      () => group.root(h.span as any),
      /a part for <div> was given <span>/
    )
    assert.throws(
      () => group.radio({ element: h.div as any, value: "ssd" }),
      /a part for <button> was given <div>/
    )
    assert.throws(
      () => group.indicator({ element: h.div as any, value: "ssd" }),
      /a part for <span> was given <div>/
    )
    assert.throws(
      () => group.radio({ element: h.button, value: "missing" }),
      /no item with value/
    )
    assert.throws(
      () => group.indicator({ element: h.span, value: "missing" }),
      /no item with value/
    )
  })

  it.effect("integrates with Field, keeping aria-invalid on the radiogroup only", () =>
    Effect.gen(function*() {
      const FieldHost = C.define({
        name: "FieldHost",
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: ($) => $.model,
        view: (viewH) =>
          Field(viewH, {
            props: { invalid: true },
            view: (field) =>
              field.root(viewH.div).children(
                field.legend(viewH.div).children("Storage"),
                RadioGroup(viewH, {
                  props: {
                    value: null,
                    items: [{ value: "ssd" }],
                    disabled: field.disabled,
                    invalid: field.invalid
                  },
                  onEmit: { Picked: () => undefined },
                  view: (radioGroup) =>
                    radioGroup.root(field.group(viewH.div)).children(
                      radioGroup.radio({
                        element: field.member(
                          viewH.button.attr("aria-label", "ssd")
                        ),
                        value: "ssd"
                      })
                    )
                })
              )
          })
      })

      const scene = yield* Scene.make(FieldHost, {})
      assert.deepInclude(scene.get(root).attrs, {
        role: "radiogroup",
        "aria-invalid": "true"
      })
      assert.isUndefined(scene.get(radio("ssd")).attrs?.["aria-invalid"])
    }))
})
