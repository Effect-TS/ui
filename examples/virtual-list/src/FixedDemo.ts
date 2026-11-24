import { Component, UiSchema } from "@effect/ui"
import { VirtualList, VirtualListScrollTarget } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const FixedMessage = UiSchema.TaggedEnum({ ClickedLast: {} })

export const FixedDemo = Component.define({
  name: "FixedDemo",
  scoped: false,
  model: Schema.Struct({ jump: Schema.Number }),
  message: FixedMessage,
  elements: Html
}).make({
  init: () => ({ jump: 0 }),
  update: { ClickedLast: ($) => ({ jump: $.model.jump + 1 }) },
  view: (h, model) =>
    h.div.class("page").children(
      h.div.class("toolbar").children(
        h.button.attr("id", "last").onClick(FixedMessage.ClickedLast())
          .children("Jump to the last row")
      ),
      VirtualList(h, {
        props: {
          count: 10_000,
          itemSize: 32,
          measure: false,
          scrollTo: model.jump === 0
            ? undefined
            : {
              target: VirtualListScrollTarget.Index({ index: 9999 }),
              align: "end",
              id: model.jump
            }
        },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.list(h.ul.class("rows")).children(
              virtualList.items.map((index) =>
                virtualList.item({
                  element: h.li.class("row padded").key(String(index)),
                  index
                }).children(
                  "Row " + index
                )
              )
            )
          )
      })
    )
})
