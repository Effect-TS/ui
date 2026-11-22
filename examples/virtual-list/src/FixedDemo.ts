import { Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit"
import { Schema } from "effect"
import { Html } from "./shared.ts"

// Phase 1, item 4: `measure: false` with CSS that disagrees. `.padded` would
// make each row 40px tall; the list writes 32px on each row, so the layout
// it computes is the one on screen.
const FixedMessage = UiSchema.TaggedEnum({ ClickedLast: {} })

export const FixedDemo = Component.define({
  name: "FixedDemo",
  scoped: false,
  model: Schema.Struct({ jump: Schema.Number }),
  message: FixedMessage,
  elements: Html
}).make({
  init: () => ({ jump: 0 }),
  update: { ClickedLast: (model) => ({ jump: model.jump + 1 }) },
  view: (model, h) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "last").onClick(FixedMessage.ClickedLast()).children("Jump to the last row")
      ),
      VirtualList(h, {
        props: {
          count: 10_000,
          itemSize: 32,
          measure: false,
          ...(model.jump === 0
            ? {}
            : { scrollTo: { target: VirtualListScrollTarget.Index({ index: 9999 }), align: "end", id: model.jump } })
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.ul.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({ element: h.li.class("row padded").key(String(index)), index }).children(
                  "Row " + index
                )
              )
            )
          )
      })
    )
})
