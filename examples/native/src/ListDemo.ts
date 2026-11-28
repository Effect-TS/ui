// A long list on `VirtualList`: 10,000 rows of mixed heights in sections,
// with jumps, rows added at either end and rows that grow.
import { Pressable, VirtualList } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Virtualizer from "@effect/ui/Virtualizer"
import * as Schema from "effect/Schema"

const Message = UiSchema.TaggedEnum({
  Jumped: { target: Virtualizer.ScrollTarget },
  Prepended: {},
  Appended: {},
  Grew: {},
  Scrolled: { seen: Schema.String }
})

type Message = typeof Message.Type

const section = 100

// `keys` and `sticky` are kept in the model, so the list sees the same
// arrays until the rows change.
const rowsOf = (first: number, count: number) => {
  const rows = Array.from({ length: count }, (_, i) => first + i)
  return {
    rows,
    keys: rows.map(String),
    sticky: rows.flatMap((row, i) => row % section === 0 ? [i] : [])
  }
}

const button = {
  backgroundColor: "#111827",
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 6
} as const

const pressable = (h: Native.H<Message>, message: Message, text: string) =>
  Pressable(h, {
    onPress: message,
    props: { pressedStyle: { backgroundColor: "#374151" } }
  }).style(button).children(
    h.text.style({ color: "white", fontSize: 13 }).children(text)
  )

export const ListDemo = Native.component({
  name: "ListDemo",
  model: Schema.Struct({
    // Row numbers, so rows added before the first are negative.
    rows: Schema.Array(Schema.Number),
    keys: Schema.Array(Schema.String),
    sticky: Schema.Array(Schema.Number),
    tall: Schema.Boolean,
    scrollTo: Schema.NullOr(Virtualizer.ScrollTo),
    seen: Schema.String
  }),
  message: Message
}).make({
  init: () => ({
    ...rowsOf(0, 10_000),
    tall: false,
    scrollTo: null,
    seen: ""
  }),
  update: {
    Jumped: ($, { target }) =>
      $.evolve({
        scrollTo: (last) => ({ target, id: Number(last?.id ?? 0) + 1 })
      }),
    Prepended: ({ model }) => ({
      ...model,
      ...rowsOf(model.rows[0]! - 20, model.rows.length + 20)
    }),
    Appended: ({ model }) => ({
      ...model,
      ...rowsOf(model.rows[0]!, model.rows.length + 20)
    }),
    Grew: ($) => $.evolve({ tall: (tall) => !tall }),
    Scrolled: ($, { seen }) => $.evolve({ seen: () => seen })
  },
  view: (h, model) => {
    const { keys, sticky } = model
    return h.view.style({ flex: 1 }).children(
      h.view.style({
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        paddingHorizontal: 12,
        paddingBottom: 8
      }).children(
        pressable(
          h,
          Message.Jumped({
            target: Virtualizer.ScrollTarget.Index({ index: 0 })
          }),
          "Top"
        ),
        pressable(
          h,
          Message.Jumped({
            target: Virtualizer.ScrollTarget.Key({ key: "5000" })
          }),
          "Row 5000"
        ),
        pressable(
          h,
          Message.Jumped({ target: Virtualizer.ScrollTarget.End() }),
          "End"
        ),
        pressable(h, Message.Prepended(), "Prepend 20"),
        pressable(h, Message.Appended(), "Append 20"),
        pressable(h, Message.Grew(), model.tall ? "Shrink" : "Grow")
      ),
      VirtualList(h, {
        props: {
          keys,
          itemSize: 48,
          sticky,
          followEnd: true,
          ...(model.scrollTo === null ? {} : { scrollTo: model.scrollTo })
        },
        onEmit: {
          Scrolled: ({ atEnd, atStart, first, last, scrolling }) =>
            Message.Scrolled({
              seen: `rows ${model.rows[first] ?? first}-${
                model.rows[last] ?? last
              }${atStart ? " start" : ""}${atEnd ? " end" : ""}${
                scrolling ? " scrolling" : ""
              }`
            })
        },
        view: (list) =>
          h.view.style({ flex: 1 }).children(
            h.text.style({
              fontSize: 13,
              color: "#374151",
              paddingHorizontal: 12
            })
              .children(
                `${model.seen} | ${list.items.length} rendered of ${list.count}`
              ),
            list.list(h.scroll.style({ flex: 1 })).children(
              list.items.map((index) => {
                const row = model.rows[index]!
                const header = row % section === 0
                return list.item({
                  element: h.view.key(keys[index]!).style(
                    header
                      ? {
                        backgroundColor: "#1f2937",
                        paddingVertical: 10,
                        paddingHorizontal: 16
                      }
                      : {
                        paddingVertical: model.tall ? 24 : 10,
                        paddingHorizontal: 16,
                        borderBottomWidth: 1,
                        borderColor: "#e5e7eb",
                        backgroundColor: row < 0 ? "#fef3c7" : "white"
                      }
                  ),
                  index
                }).children(
                  h.text.style({
                    fontSize: header ? 15 : 16,
                    fontWeight: header ? "bold" : "normal",
                    color: header ? "white" : "#111827"
                  }).children(
                    header
                      ? `Section ${row / section}`
                      : `Row ${row}${
                        row % 5 === 0 ? "\nwith a second line\nand a third" : ""
                      }`
                  )
                )
              })
            )
          )
      })
    )
  }
})
