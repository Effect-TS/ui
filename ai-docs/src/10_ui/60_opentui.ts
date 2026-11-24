/**
 * @title Terminal apps with OpenTUI
 *
 * Build Effect UI terminal applications with `@effect/ui-opentui`, using the
 * OpenTUI vocabulary, global key shortcuts, controlled inputs, imperative
 * commands, and both FFI-free and frame-rendered tests.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Component, Head, UiSchema } from "@effect/ui"
import {
  OpenTui,
  OpenTuiCommand,
  OpenTuiHost,
  OpenTuiSubscription
} from "@effect/ui-opentui"
import { OpenTuiTest, TestOpenTuiEvents } from "@effect/ui-opentui/testing"
import { TestHost } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"

// ---------------------------------------------------------------------------
// Vocabulary, controlled inputs, global shortcuts, and quitting
// ---------------------------------------------------------------------------

const TaskMessage = UiSchema.TaggedEnum({
  UpdatedDraft: { value: Schema.String },
  SubmittedDraft: {},
  ChangedSelection: { index: Schema.Number },
  SwitchedFocus: {},
  RequestedQuit: {}
})

const TaskModel = Schema.Struct({
  draft: Schema.String,
  items: Schema.Array(Schema.String),
  selectedIndex: Schema.Number,
  focus: Schema.Literals(["input", "list"])
})

// Set `elements: OpenTui` per component (or import `@effect/ui-opentui/register`
// once at your entrypoint) to put OpenTUI tags on `h`. Layout containers like
// `h.box` and `h.scrollbox` reject raw strings at compile time and runtime so
// every piece of text explicitly lives inside `h.text(...)` or an inline
// modifier (`h.span`, `h.b`, `h.i`, `h.u`, `h.a`).
export const TaskBoard = Component.define({
  name: "TaskBoard",
  model: TaskModel,
  message: TaskMessage,
  elements: OpenTui
}).make({
  init: () => ({
    draft: "",
    items: ["Wire OpenTUI host", "Add terminal Snake example"],
    selectedIndex: 0,
    focus: "input" as const
  }),
  update: {
    UpdatedDraft: ($, { value }) => $.evolve({ draft: value }),
    SubmittedDraft: ($) => {
      const next = $.model.draft.trim()
      if (next === "") return $.model
      return $.evolve({
        draft: "",
        items: (items) => [...items, next]
      })
    },
    ChangedSelection: ($, { index }) => $.evolve({ selectedIndex: index }),
    SwitchedFocus: ($) =>
      $.evolve({ focus: (f) => (f === "input" ? "list" : "input") }),
    // `OpenTuiCommand.quit()` destroys the CliRenderer cleanly, which ends
    // `OpenTuiHost.run(...)` and closes the application Scope.
    RequestedQuit: ($) => $.run(OpenTuiCommand.quit())
  },
  // `OpenTuiSubscription.shortcuts` attaches synchronously via
  // `Subscription.direct` with `preventDefault: true`, so matched shortcuts
  // are cancelled before the focused renderable consumes the key. By default
  // shortcuts ignore keys while an editor is focused unless `whileTyping: true`.
  subscriptions: () => [
    OpenTuiSubscription.shortcuts([
      { key: "tab", message: TaskMessage.SwitchedFocus(), whileTyping: true },
      { key: "q", message: TaskMessage.RequestedQuit() }
    ])
  ],
  // `Head.title` updates the terminal window title via `renderer.setTerminalTitle`.
  head: ({ model }) => [Head.title(`Tasks (${model.items.length})`)],
  view: (h, model) =>
    h.box.style({
      border: true,
      flexDirection: "column",
      padding: 1,
      gap: 1,
      width: 50
    }).title("Tasks").children(
      // `.focused(bool)` is controlled and applied in `commit()` (blurs before
      // focuses) so the Model owns the terminal focus ring cleanly.
      h.input.style({ width: 44 }).placeholder("New task...").value(model.draft)
        .focused(model.focus === "input")
        .onInput(({ value }) => TaskMessage.UpdatedDraft({ value }))
        .onEnter(TaskMessage.SubmittedDraft()),
      // Inline option arrays are compared structurally by `OpenTuiHost`, so
      // passing fresh arrays on re-render does not reset the select widget.
      h.select.style({ width: 44, height: 6 }).options(
        model.items.map((name) => ({ name, description: "" }))
      ).selectedIndex(model.selectedIndex).focused(model.focus === "list")
        .onSelectionChanged(({ index }) =>
          TaskMessage.ChangedSelection({ index })
        ),
      h.text.style({ fg: "#9ca3af" }).children(
        h.b("Tab"),
        ": switch focus  ",
        h.b("Enter"),
        ": add  ",
        h.b("q"),
        ": quit"
      )
    )
})

// ---------------------------------------------------------------------------
// Running a terminal app
// ---------------------------------------------------------------------------

// `OpenTuiHost.run` owns the `CliRenderer` lifecycle and completes once the
// renderer is destroyed (Ctrl+C, exit signal, or `OpenTuiCommand.quit()`).
export const main = () =>
  OpenTuiHost.run(TaskBoard, {}).pipe(NodeRuntime.runMain)

// ---------------------------------------------------------------------------
// Testing without FFI (`TestHost` + `TestOpenTuiEvents`)
// ---------------------------------------------------------------------------

// Use `TestHost.layer()` with `TestOpenTuiEvents.layer` for fast unit tests
// that do not load OpenTUI's native library.
export const unitTest = Effect.gen(function*() {
  const root = yield* TestHost.mount(TaskBoard, {})
  yield* TestHost.settle

  // Tab switches focus even while typing (`whileTyping: true`).
  const prevented = yield* TestOpenTuiEvents.pressKey("tab", { editable: true })
  yield* TestHost.settle
  return { prevented, focus: root.model()?.focus }
}).pipe(
  Effect.provide(Layer.merge(TestHost.layer(), TestOpenTuiEvents.layer)),
  Effect.scoped
)

// ---------------------------------------------------------------------------
// Integration testing with rendered terminal frames (`OpenTuiTest`)
// ---------------------------------------------------------------------------

// Use `OpenTuiTest.mount` to mount onto `@opentui/core/testing` and assert on
// rendered character frames (run Node with `--experimental-ffi`, or run on Bun).
export const frameTest = Effect.gen(function*() {
  const app = yield* OpenTuiTest.mount(TaskBoard, {}, {
    width: 54,
    height: 14
  })
  yield* app.typeText("Ship it")
  yield* app.pressEnter
  return app.captureFrame()
}).pipe(Effect.scoped)
