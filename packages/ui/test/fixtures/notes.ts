/**
 * A note editor for the acknowledgement rule: a Command per mode, a stream
 * Command, an event, a child, a query, and a handler that can produce no
 * message.
 */
import { Command, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import * as users from "./users.ts"

export const BadgeEvents = UiSchema.TaggedEnum({
  Opened: { count: Schema.Number }
})

export const Badge = Html.component({
  name: "Badge",
  model: Schema.Number,
  message: Schema.Never,
  events: BadgeEvents
}).make({
  init: () => 0,
  update: () => 0,
  view: (h, count) => h.span(String(count))
})

export const NoteMessage = UiSchema.TaggedEnum({
  Edit: { text: Schema.String },
  Save: {},
  Saved: {},
  Find: { text: Schema.String },
  Found: { items: Schema.Array(Schema.String) },
  Follow: {},
  Line: { line: Schema.String },
  Sync: {},
  Synced: {},
  Opened: { count: Schema.Number },
  Author: { id: Schema.String }
})
export type NoteMessage = typeof NoteMessage.Type

export const NoteEvents = UiSchema.TaggedEnum({
  Saved: { text: Schema.String }
})

export const SaveNote = Command.make(
  "notes/SaveNote",
  { args: { text: Schema.String } },
  () => Effect.succeed(NoteMessage.Saved())
)
export const FindNotes = Command.make(
  "notes/FindNotes",
  { args: { text: Schema.String }, mode: "switch" },
  ({ text }) => Effect.succeed(NoteMessage.Found({ items: [text] }))
)
export const SyncNote = Command.make(
  "notes/SyncNote",
  { args: {}, mode: "queue" },
  () => Effect.succeed(NoteMessage.Synced())
)
export const FollowNotes = Command.make(
  "notes/FollowNotes",
  { args: {}, stream: true },
  () => Stream.make(NoteMessage.Line({ line: "a" }))
)

export const Note = Html.component({
  name: "Note",
  props: Schema.Struct({ author: Schema.optional(Schema.String) }),
  model: Schema.Struct({
    text: Schema.String,
    saved: Schema.Boolean,
    items: Schema.Array(Schema.String),
    lines: Schema.Number,
    author: Schema.optional(Schema.String)
  }),
  message: NoteMessage,
  events: NoteEvents,
  queries: {
    author: {
      query: users.GetUser,
      args: ({ model, props }) => {
        const id = model.author ?? props.author
        return id === undefined ? undefined : { id }
      }
    }
  }
}).make({
  init: () => ({ text: "", saved: false, items: [], lines: 0 }),
  update: ($, message) =>
    NoteMessage.match(message, {
      Edit: ({ text }) => ({ ...$.model, text, saved: false }),
      Save: () => $.run(SaveNote.make({ text: $.model.text })),
      Saved: () =>
        $.set({ ...$.model, saved: true }).emit(
          NoteEvents.Saved({ text: $.model.text })
        ),
      Find: ({ text }) => $.run(FindNotes.make({ text })),
      Found: ({ items }) => ({ ...$.model, items }),
      Follow: () => $.run(FollowNotes.make({})),
      Line: () => ({ ...$.model, lines: $.model.lines + 1 }),
      Sync: () => $.run(SyncNote.make({})),
      Synced: () => $.model,
      Opened: ({ count }) => ({ ...$.model, text: `opened ${count}` }),
      Author: ({ id }) => ({ ...$.model, author: id })
    }),
  view: (h, model) =>
    h.div(
      h.input.attr("aria-label", "Text").value(model.text).on("input", (
        { value }
      ) =>
        value === model.text ? undefined : NoteMessage.Edit({ text: value })),
      h.button.on("click", () => NoteMessage.Save()).children(
        h.isRunning(SaveNote) ? "saving" : "save"
      ),
      h.button.on("click", () => model.saved ? undefined : NoteMessage.Save())
        .children("save again"),
      h.p.attr("role", "status").children(
        model.saved ? `saved ${model.text}` : model.text
      ),
      Badge(h, {
        key: "Badge",
        onEmit: (event) => NoteMessage.Opened({ count: event.count })
      })
    )
})
