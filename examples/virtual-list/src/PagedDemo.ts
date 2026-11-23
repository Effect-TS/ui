import { Component, UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const Total = Schema.Literals(["known", "unknown", "none"])

const PagedMessage = UiSchema.TaggedEnum({ PickedTotal: { total: Total } })

export const PagedDemo = Component.define({
  name: "PagedDemo",
  scoped: false,
  model: Schema.Struct({ total: Total }),
  message: PagedMessage,
  elements: Html
}).make({
  init: () => ({ total: "known" as const }),
  update: { PickedTotal: ($, { total }) => ({ ...$.model, total }) },
  view: (h, model) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "known").onClick(PagedMessage.PickedTotal({ total: "known" })).children("10,000 results"),
        h.button.attr("id", "unknown").onClick(PagedMessage.PickedTotal({ total: "unknown" })).children(
          "Unknown total"
        ),
        h.button.attr("id", "none").onClick(PagedMessage.PickedTotal({ total: "none" })).children("Neither prop")
      ),
      VirtualList(h, {
        props: {
          count: 50,
          itemSize: 40,
          ...(model.total === "none" ? {} : { firstPosition: 201, setSize: model.total === "known" ? 10_000 : -1 })
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.ul.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({ element: h.li.class("row").key(String(index)), index }).children(
                  "Result " + (201 + index)
                )
              )
            )
          )
      })
    )
})
