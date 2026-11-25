import { UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const AbsoluteMessage = UiSchema.TaggedEnum({
  ToggledLayout: {},
  ToggledRow: { index: Schema.Number }
})

const heightOf = (index: number, grown: ReadonlyArray<number>) =>
  32 + (index % 4) * 10 + (grown.includes(index) ? 80 : 0)

export const AbsoluteDemo = Html.component({
  name: "AbsoluteDemo",

  model: Schema.Struct({
    absolute: Schema.Boolean,
    grown: Schema.Array(Schema.Number)
  }),

  message: AbsoluteMessage
}).make({
  init: () => ({ absolute: true, grown: [] }),
  update: {
    ToggledLayout: ($) => $.evolve({ absolute: (absolute) => !absolute }),
    ToggledRow: ($, { index }) =>
      $.evolve({
        grown: (grown) =>
          grown.includes(index)
            ? grown.filter((i) => i !== index)
            : [...grown, index]
      })
  },
  view: (h, model) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "toggle-layout").on(
          "click",
          AbsoluteMessage.ToggledLayout()
        ).children(
          model.absolute ? "Use the flow layout" : "Use the absolute layout"
        )
      ),
      VirtualList(h, {
        props: {
          count: 10_000,
          itemSize: 47,
          sizes: Array.from({ length: 10_000 }, (_, index) =>
            heightOf(index, model.grown)),
          layout: model.absolute ? "absolute" : "flow"
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.div.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.div.class(model.absolute ? "row moving" : "row")
                    .key(String(index)),
                  index
                })
                  .attr("style", `height:${heightOf(index, model.grown)}px`)
                  .children(
                    h.button.class("row-button").on(
                      "click",
                      AbsoluteMessage.ToggledRow({ index })
                    ).children(
                      "Row " + index
                    )
                  )
              )
            )
          )
      })
    )
})
