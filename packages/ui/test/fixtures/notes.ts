/**
 * A note editor for the acknowledgement rule: a Command per mode, a stream
 * Command, an event, a send to a child, a query, and a handler that can
 * produce no message.
 */
import { Command, Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import * as users from "./users.ts"

export const BadgeMessage = UiSchema.TaggedEnum({ Clear: {} })
export const BadgeEvents = UiSchema.TaggedEnum({ Opened: { count: Schema.Number } })

export const Badge = Component.define({
  name: "Badge",
  scoped: false,
  model: Schema.Number,
  message: BadgeMessage,
  events: BadgeEvents,
  receives: ["Clear"],
  elements: Html
}).make({
  init: () => 0,
  update: () => 0,
  view: (count, h) => h.span(String(count))
})

export const BadgeRef = Badge.ref("Badge")

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
  Clear: {},
  Opened: { count: Schema.Number },
  Author: { id: Schema.String }
})
export type NoteMessage = typeof NoteMessage.Type

export const NoteEvents = UiSchema.TaggedEnum({ Saved: { text: Schema.String } })

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

export const Note = Component.define({
  name: "Note",
  scoped: false,
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
  elements: Html,
  queries: {
    author: {
      query: users.GetUser,
      args: (model, props) => {
        const id = model.author ?? props.author
        return id === undefined ? undefined : { id }
      }
    }
  }
}).make({
  init: () => ({ text: "", saved: false, items: [], lines: 0 }),
  update: (model, message, $) =>
    NoteMessage.match(message, {
      Edit: ({ text }) => ({ ...model, text, saved: false }),
      Save: () => $.run(SaveNote({ text: model.text })),
      Saved: () => $.set({ ...model, saved: true }).emit(NoteEvents.Saved({ text: model.text })),
      Find: ({ text }) => $.run(FindNotes({ text })),
      Found: ({ items }) => ({ ...model, items }),
      Follow: () => $.run(FollowNotes({})),
      Line: () => ({ ...model, lines: model.lines + 1 }),
      Sync: () => $.run(SyncNote({})),
      Synced: () => model,
      Clear: () => $.send(BadgeRef, { _tag: "Clear" }),
      Opened: ({ count }) => ({ ...model, text: `opened ${count}` }),
      Author: ({ id }) => ({ ...model, author: id })
    }),
  view: (model, h) =>
    h.div(
      h.input.attr("aria-label", "Text").value(model.text).onInput(({ value }) =>
        value === model.text ? undefined : NoteMessage.Edit({ text: value })
      ),
      h.button.onClick(() => NoteMessage.Save()).children(h.isRunning(SaveNote) ? "saving" : "save"),
      h.button.onClick(() => model.saved ? undefined : NoteMessage.Save()).children("save again"),
      h.p.attr("role", "status").children(model.saved ? `saved ${model.text}` : model.text),
      Badge(h, { ref: BadgeRef, onEmit: (event) => NoteMessage.Opened({ count: event.count }) })
    )
})
