import { Command, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const sections = 40
const rows = 50

const Fail = Command.make(
  "rows/Fail",
  { args: {} },
  () => Effect.die("row failed")
)
const Hold = Command.make("rows/Hold", { args: {} }, () => Effect.never)

const RowMessage = UiSchema.TaggedEnum({
  ClickedRow: {},
  ClickedFail: {},
  ClickedHold: {}
})
const Row = Html.component({
  name: "Row",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ count: Schema.Number }),
  message: RowMessage
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedRow: ($) => $.evolve({ count: $.model.count + 1 }),
    ClickedFail: ($) => $.run(Fail.make()),
    ClickedHold: ($) => $.run(Hold.make())
  },
  view: (h, model) =>
    h.span(
      h.button.attr("data-row", h.props.id).on("click", RowMessage.ClickedRow())
        .children(h.props.id + " " + model.count),
      h.button.attr("data-fail", h.props.id).on(
        "click",
        RowMessage.ClickedFail()
      )
        .children("!"),
      h.button.attr("data-hold", h.props.id).on(
        "click",
        RowMessage.ClickedHold()
      )
        .children("~")
    )
})

const Shelf = Html.component({
  name: "Shelf",
  props: Schema.Struct({ id: Schema.String, drop: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div(
      Array.from({ length: rows }, (_, i) => h.props.id + "-" + i).filter((
        id
      ) => !h.props.drop || id !== "s0-1").map(
        (id) => Row(h, { key: id, props: { id } })
      )
    )
})

const Section = Html.component({
  name: "Section",
  props: Schema.Struct({ id: Schema.String, drop: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section(Shelf(h, { key: "shelf", props: h.props }))
})

const AppMessage = UiSchema.TaggedEnum({ ClickedDrop: {} })
const App = Html.component({
  name: "App",
  model: Schema.Struct({ drop: Schema.Boolean }),
  message: AppMessage
}).make({
  init: () => ({ drop: false }),
  update: { ClickedDrop: ($) => $.evolve({ drop: true }) },
  view: (h, model) =>
    h.main(
      h.button.attr("data-drop", "").on("click", AppMessage.ClickedDrop())
        .children(
          "Drop"
        ),
      Array.from({ length: sections }, (_, i) =>
        Section(h, { key: "s" + i, props: { id: "s" + i, drop: model.drop } }))
    )
})

const Main = BrowserHost.mount(App, {}, document.getElementById("root")!).pipe(
  Layer.provide(DevTools.layer({ position: "BottomRight" }))
)

Layer.launch(Main).pipe(Effect.runFork)
const ready = () =>
  document.querySelectorAll("[data-row]").length === sections * rows
    ? document.body.setAttribute("data-ready", "")
    : requestAnimationFrame(ready)
ready()
