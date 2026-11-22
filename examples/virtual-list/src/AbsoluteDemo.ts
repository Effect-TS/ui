import { Component, UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Schema } from "effect"
import { Html } from "./shared.ts"

// Phase 3, item 8: rows placed with a transform. The same rows render in
// either layout, and a row that grows moves the ones after it. Only the
// absolute layout animates the rows: a transition on rows in the flow layout
// would animate the switch between the two. `sizes` gives every row its real
// height up front, so the rows above never shift as estimates change, which
// the transition would show as a jump.
const AbsoluteMessage = UiSchema.TaggedEnum({ ToggledLayout: {}, ToggledRow: { index: Schema.Number } })

const heightOf = (index: number, grown: ReadonlyArray<number>) =>
  32 + (index % 4) * 10 + (grown.includes(index) ? 80 : 0)

export const AbsoluteDemo = Component.define({
  name: "AbsoluteDemo",
  scoped: false,
  model: Schema.Struct({ absolute: Schema.Boolean, grown: Schema.Array(Schema.Number) }),
  message: AbsoluteMessage,
  elements: Html
}).make({
  init: () => ({ absolute: true, grown: [] }),
  update: {
    ToggledLayout: (model) => ({ ...model, absolute: !model.absolute }),
    ToggledRow: (model, { index }) => ({
      ...model,
      grown: model.grown.includes(index) ? model.grown.filter((i) => i !== index) : [...model.grown, index]
    })
  },
  view: (model, h) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "toggle-layout").onClick(AbsoluteMessage.ToggledLayout()).children(
          model.absolute ? "Use the flow layout" : "Use the absolute layout"
        )
      ),
      VirtualList(h, {
        props: {
          count: 10_000,
          itemSize: 47,
          sizes: Array.from({ length: 10_000 }, (_, index) => heightOf(index, model.grown)),
          layout: model.absolute ? "absolute" : "flow"
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.div.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.div.class(model.absolute ? "row moving" : "row").key(String(index)),
                  index
                })
                  .attr("style", `height:${heightOf(index, model.grown)}px`)
                  .children(
                    h.button.class("row-button").onClick(AbsoluteMessage.ToggledRow({ index })).children(
                      "Row " + index
                    )
                  )
              )
            )
          )
      })
    )
})
