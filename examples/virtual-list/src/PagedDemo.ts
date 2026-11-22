import { Component, UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Schema } from "effect"
import { Html } from "./shared.ts"

// Phase 1, item 3: the 50 results of page 5 of a 10,000 result search. Each
// result says where it is in the whole set, not in the 50 that are loaded.
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
  update: { PickedTotal: (model, { total }) => ({ ...model, total }) },
  view: (model, h) =>
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
          // Page 5 of 50 per page starts at result 201. -1 says the total
          // isn't known, as `aria-setsize` does.
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
