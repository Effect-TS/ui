import { UiSchema } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const HeaderMessage = UiSchema.TaggedEnum({
  ToggledHeader: {},
  ToggledScroller: {}
})

export const HeaderDemo = Html.component({
  name: "HeaderDemo",
  model: Schema.Struct({ tall: Schema.Boolean, scroller: Schema.Boolean }),
  message: HeaderMessage
}).make({
  init: () => ({ tall: false, scroller: false }),
  update: {
    ToggledHeader: ($) => $.evolve({ tall: (tall) => !tall }),
    ToggledScroller: ($) => $.evolve({ scroller: (scroller) => !scroller })
  },
  view: (h, model) =>
    h.div.children(
      h.div.class("toolbar fixed").children(
        h.button.attr("id", "grow-header").on(
          "click",
          HeaderMessage.ToggledHeader()
        ).children(
          model.tall ? "Shrink header" : "Grow header"
        ),
        h.button.attr("id", "toggle-scroller").on(
          "click",
          HeaderMessage.ToggledScroller()
        ).children(
          model.scroller ? "Scroll the page" : "Scroll a viewport"
        )
      ),
      VirtualList(h, {
        props: { count: 10_000, itemSize: 32 },
        view: (virtualList) => {
          const header = h.header.class("banner").attr(
            "style",
            `height:${model.tall ? 600 : 100}px`
          ).children(
            h.h1.children("Rows under a header"),
            h.p.children("Scroll down, then grow the header without scrolling.")
          )
          const list = virtualList.list(h.ul.class("rows")).children(
            virtualList.items.map((index) =>
              virtualList.item({
                element: h.li.class("row").key(String(index)),
                index
              }).children("Row " + index)
            )
          )
          return model.scroller
            ? virtualList.viewport(h.div.class("scroller tall")).children(
              header,
              list
            )
            : h.div.children(header, list)
        }
      })
    )
})
