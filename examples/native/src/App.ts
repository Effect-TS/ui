// Every export of this module is a component, so an edit to it swaps in
// place in the dev client and keeps the count, the name and the list.
import { Image, Pan, Pressable, VirtualView } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import mark from "./assets/mark.png"

const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number
})

const Message = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
  ChangedName: { value: Schema.String },
  ChangedNotes: { value: Schema.String },
  ClickedAdd: {},
  SelectedItem: { item: Schema.String },
  Dragged: { dx: Schema.Number },
  Dropped: {},
  CancelledDrag: {},
  ToggledVirtual: {},
  JumpedFar: {},
  ModeChanged: {
    id: Schema.String,
    mode: Schema.Literals(["visible", "prerender", "hidden"]),
    rect: Rect
  }
})

const virtualScroll = Native.ref("virtualScroll")

const ScrollFar = Command.make(
  "ScrollFar",
  {},
  () =>
    Renderer.Refs.use((refs) =>
      Effect.flatMap(refs.lookup(virtualScroll), (node) =>
        Option.isNone(node)
          ? Effect.succeed(Component.noop)
          : Native.Host.useSync((host) => {
            host.scrollTo(node.value, 0, 20_000, false)
            return Component.noop
          }))
    )
)

const virtualRows = Array.from({ length: 300 }, (_, i) => String(i + 1))

const button = {
  backgroundColor: "#111827",
  paddingHorizontal: 20,
  paddingVertical: 12,
  borderRadius: 8
} as const

const label = { color: "white", fontSize: 18, textAlign: "center" } as const

const field = {
  borderWidth: 1,
  borderColor: "#9ca3af",
  borderRadius: 8,
  padding: 8
} as const

const pressable = (
  h: Native.H<typeof Message.Type>,
  message: typeof Message.Type,
  text: string
) =>
  Pressable(h, {
    onPress: message,
    props: {
      pressedStyle: { backgroundColor: "#374151" },
      android_ripple: { color: "#ffffff40" }
    }
  }).style(button).children(h.text.style(label).children(text))

export const App = Native.component({
  name: "App",
  model: Schema.Struct({
    count: Schema.Number,
    name: Schema.String,
    notes: Schema.String,
    items: Schema.Array(Schema.String),
    selected: Schema.String,
    // The handle's offset while dragged, and where it was last dropped.
    dragged: Schema.Number,
    dropped: Schema.Number,
    showVirtual: Schema.Boolean,
    hidden: Schema.Record(Schema.String, Rect)
  }),
  message: Message
}).make({
  init: () => ({
    count: 0,
    name: "",
    notes: "",
    items: [],
    selected: "",
    dragged: 0,
    dropped: 0,
    showVirtual: false,
    hidden: {}
  }),
  update: {
    ClickedDecrement: ($) => $.evolve({ count: (count) => count - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
    ClickedReset: ($) => $.evolve({ count: 0, name: "", notes: "" }),
    ChangedName: ($, { value }) => $.evolve({ name: value }),
    ChangedNotes: ($, { value }) => $.evolve({ notes: value }),
    ClickedAdd: ($) =>
      $.evolve({
        items: (
          items
        ) => [
          ...items,
          `Item ${items.length + 1}: ${$.model.name || "stranger"}`
        ]
      }),
    SelectedItem: ($, { item }) => $.evolve({ selected: item }),
    Dragged: ($, { dx }) => $.evolve({ dragged: $.model.dropped + dx }),
    Dropped: ($) => $.evolve({ dropped: $.model.dragged }),
    CancelledDrag: ($) => $.evolve({ dragged: $.model.dropped }),
    ToggledVirtual: ($) =>
      $.evolve({ showVirtual: (show) => !show, hidden: () => ({}) }),
    JumpedFar: ($) => $.run(ScrollFar.make()),
    ModeChanged: ($, { id, mode, rect }) =>
      $.evolve({
        hidden: (hidden) => {
          if (mode === "hidden") return { ...hidden, [id]: rect }
          if (!(id in hidden)) return hidden
          const next = { ...hidden }
          delete next[id]
          return next
        }
      })
  },
  view: (h, model) => {
    if (model.showVirtual) {
      const rendered = virtualRows.length - Object.keys(model.hidden).length
      return h.view.style({
        flex: 1,
        paddingTop: 48,
        backgroundColor: "white"
      }).children(
        h.view.style({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingBottom: 12,
          gap: 8
        }).children(
          pressable(h, Message.ToggledVirtual(), "Back"),
          pressable(h, Message.JumpedFar(), "Jump"),
          h.text.style({ fontSize: 13, color: "#374151", flex: 1 }).children(
            `${rendered}/${virtualRows.length} rendered`
          )
        ),
        h.scroll.ref(virtualScroll).style({ flex: 1 }).children(
          ...virtualRows.map((row) =>
            VirtualView(h, {
              hidden: model.hidden[row],
              children: () =>
                h.view.style({
                  height: 92,
                  marginHorizontal: 16,
                  marginVertical: 4,
                  padding: 16,
                  borderRadius: 10,
                  backgroundColor: "#f3f4f6",
                  justifyContent: "center"
                }).children(
                  h.text.style({
                    fontSize: 18,
                    fontWeight: "bold",
                    color: "#111827"
                  }).children(`Row ${row}`)
                )
            }).key(row).on(
              "modeChange",
              ({ mode, targetRect }) =>
                Message.ModeChanged({ id: row, mode, rect: targetRect })
            )
          )
        )
      )
    }
    return h.view.style({
      flex: 1,
      paddingTop: 64,
      paddingHorizontal: 24,
      gap: 20,
      backgroundColor: "white"
    }).children(
      h.view.style({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12
      }).children(
        Image(h, { source: mark }),
        h.text.style({
          fontSize: 64,
          fontWeight: "bold",
          color: "#1f2937",
          textAlign: "center"
        }).children(
          String(model.count)
        )
      ),
      h.view.style({ flexDirection: "row", justifyContent: "center", gap: 16 })
        .children(
          pressable(h, Message.ClickedDecrement(), "-"),
          pressable(h, Message.ClickedReset(), "Reset"),
          pressable(h, Message.ClickedIncrement(), "+")
        ),
      h.input.value(model.name).placeholder("Your name")
        .style({ ...field, fontSize: 18 })
        .on("input", ({ value }) => Message.ChangedName({ value })),
      h.input.value(model.notes).placeholder("Notes").prop("multiline", true)
        .style({ ...field, minHeight: 72, fontSize: 16 })
        .on("input", ({ value }) => Message.ChangedNotes({ value })),
      h.text.style({ fontSize: 18, color: "#374151" }).children(
        "Hello, ",
        h.text.style({ fontWeight: "bold" }).children(model.name || "stranger")
      ),
      Pan(h, {
        onMove: ({ dx }) => Message.Dragged({ dx }),
        onEnd: Message.Dropped(),
        onCancel: Message.CancelledDrag(),
        props: { axis: "x" }
      }).style({
        left: model.dragged,
        alignSelf: "flex-start",
        padding: 12,
        borderRadius: 8,
        backgroundColor: "#e5e7eb"
      }).children(h.text.style({ fontSize: 16 }).children("Drag me")),
      h.view.style({ flexDirection: "row", gap: 12 }).children(
        pressable(h, Message.ClickedAdd(), "Add to list"),
        pressable(h, Message.ToggledVirtual(), "Virtual list")
      ),
      h.text.style({ fontSize: 16, color: "#374151" }).children(
        model.selected === "" ? "Tap an item" : `Selected ${model.selected}`
      ),
      h.scroll.style({ flex: 1 }).children(
        ...model.items.map((item) =>
          Pressable(h, {
            onPress: Message.SelectedItem({ item }),
            props: { pressedStyle: { backgroundColor: "#f3f4f6" } }
          }).key(item).style({ paddingVertical: 8 }).children(
            h.text.style({ fontSize: 16, color: "#111827" }).children(item)
          )
        )
      )
    )
  }
})
