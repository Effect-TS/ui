import { UiSchema, View } from "@effect/ui"
import { Separator } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
const h = View.makeHelper<typeof Msg.Type, {}, Html.Elements>({}, Html)

describe("Separator", () => {
  it("defaults to horizontal and overrides its own attributes for vertical while keeping consumer class, attributes and handlers", () => {
    assert.deepStrictEqual(View.build(Separator(h), []).attrs, {
      role: "separator",
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal"
    })

    const built = Separator(h, {
      props: { orientation: "vertical" },
      element: h.div
        .attrs({
          role: "presentation",
          "aria-orientation": "horizontal",
          "data-orientation": "horizontal"
        })
        .onClick(Msg.Clicked())
    })
      .class(["rule"])
      .attrs({
        "aria-label": "Section divider",
        role: "none",
        "aria-orientation": "horizontal",
        "data-orientation": "horizontal"
      })

    const node = View.build(built, [])
    assert.deepStrictEqual(node.attrs, {
      class: "rule",
      "aria-label": "Section divider",
      role: "separator",
      "aria-orientation": "vertical",
      "data-orientation": "vertical"
    })
    assert.deepStrictEqual(node.handlers, { click: { _tag: "Clicked" } })
  })
})
