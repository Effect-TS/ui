import { Component } from "@effect/ui"
import { VirtualList } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { textOf } from "./shared.ts"

const statuses = ["Paid", "Pending", "Refunded"]

export const TableDemo = Component.define({
  name: "TableDemo",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    h.div.class("page").children(
      VirtualList(h, {
        props: { count: 10_000, itemSize: 37, firstPosition: 2 },
        view: (virtualList) =>
          virtualList.viewport(h.div.class("scroller")).children(
            virtualList.table(h.table.class("data")).children(
              h.thead.children(
                h.tr.attr("aria-rowindex", "1").children(
                  h.th.children("#"),
                  h.th.children("Customer"),
                  h.th.children("Note"),
                  h.th.children("Status"),
                  h.th.children("Amount")
                )
              ),
              virtualList.list(h.tbody).children(
                virtualList.items.map((index) =>
                  virtualList.item({ element: h.tr.key(String(index)), index })
                    .children(
                      h.td.children(String(index)),
                      h.td.children("Customer " + ((index * 37) % 1000)),
                      h.td.children(
                        textOf(index).slice(0, 18 + (index % 5) * 6)
                      ),
                      h.td.children(
                        h.button.class("cell-button").children(
                          statuses[index % 3]!
                        )
                      ),
                      h.td.class("amount").children(
                        "$" + ((index * 7919) % 100_000 / 100).toFixed(2)
                      )
                    )
                )
              )
            )
          )
      })
    )
})
