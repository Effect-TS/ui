/**
 * @title Composing headless components
 *
 * Build a headless tag picker on top of the headless Listbox with `p.child`.
 * The picker adds the picked tags, their remove buttons and a live
 * announcement, the Listbox keeps its keyboard handling and ARIA, and a
 * consumer draws both from one closure. Then a scene of the picker that runs
 * the Listbox's events through the picker's `update`.
 */
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Locator, Scene } from "@effect/ui/testing"
import { Effect, Schema } from "effect"
import { Listbox, ListboxOption } from "./fixtures/kit/Listbox.ts"

// ---------------------------------------------------------------------------
// The composed component: `parts` returns `p.child(...)`
// ---------------------------------------------------------------------------

const TagPickerMessage = UiSchema.TaggedEnum({
  PickedTag: { id: Schema.String },
  ClickedRemove: { id: Schema.String }
})

// The consumer owns the tags, as it owns a Listbox's `selected`, so the
// picker asks for every change as the whole new list.
export const TagPickerEvents = UiSchema.TaggedEnum({
  Updated: { tags: Schema.Array(Schema.String) }
})

export const TagPicker = Html.component({
  name: "TagPicker",

  props: Schema.Struct({
    options: Schema.Array(ListboxOption),
    tags: Schema.Array(Schema.String)
  }),

  // What the status region last announced, so a screen reader hears what a
  // pick or a removal did.
  model: Schema.Struct({ announced: Schema.String }),

  message: TagPickerMessage,
  events: TagPickerEvents
}).make({
  init: () => ({ announced: "" }),
  update: ($, message) => {
    const label = (id: string) =>
      $.props.options.find((option) => option.id === id)?.label ?? id
    return TagPickerMessage.match(message, {
      PickedTag: ({ id }) =>
        $.set({ announced: `Added ${label(id)}` })
          .emit(TagPickerEvents.Updated({ tags: [...$.props.tags, id] })),
      ClickedRemove: ({ id }) =>
        $.set({ announced: `Removed ${label(id)}` })
          .emit(TagPickerEvents.Updated({
            tags: $.props.tags.filter((tag) => tag !== id)
          }))
    })
  },
  // `p.child(Listbox, ...)` declares a Listbox that this component owns. It
  // takes what a child placed in a view takes, except `view`: in its place,
  // `parts` gets the Listbox's parts and returns the ones this component's
  // consumer gets. Its type is inferred from that return, so the consumer's
  // closure needs no annotation.
  //
  // The consumer's closure runs inside the Listbox, so the Listbox's path is
  // `TagPicker[]/Listbox[]` and its ids are derived from it. What the
  // Listbox emits goes to `onEmit` here and through this component's
  // `update`, never to the consumer.
  //
  // If the Listbox fails, it shows nothing, the closure with it, and an
  // `onFailure` here hears of it. The failure stops there: this component
  // goes on.
  parts: (p, model) => {
    const picked = new Set(p.props.tags)
    return p.child(Listbox, {
      // Only the tags not picked yet are offered.
      props: {
        options: p.props.options.filter((option) => !picked.has(option.id)),
        selected: null
      },
      onEmit: { Picked: ({ id }) => TagPickerMessage.PickedTag({ id }) },
      parts: (listbox) => ({
        // Every Listbox part goes through as it is, beside this component's own.
        ...listbox,
        tags: p.props.options.filter((option) => picked.has(option.id)),
        announced: model.announced,
        remove: p.part(
          "button",
          (b, tag: ListboxOption) =>
            b.attrs({ type: "button", "aria-label": `Remove ${tag.label}` })
              .on("click", TagPickerMessage.ClickedRemove({ id: tag.id }))
        ),
        status: p.part("div", (b) => b.attr("role", "status"))
      })
    })
  }
})

// ---------------------------------------------------------------------------
// A consumer: one closure draws the picker's parts and the Listbox's
// ---------------------------------------------------------------------------

const NoteTagsMessage = UiSchema.TaggedEnum({
  UpdatedTags: { tags: Schema.Array(Schema.String) }
})

const options: ReadonlyArray<ListboxOption> = [
  { id: "work", label: "Work" },
  { id: "home", label: "Home" },
  { id: "ideas", label: "Ideas" }
]

export const NoteTags = Html.component({
  name: "NoteTags",
  model: Schema.Struct({ tags: Schema.Array(Schema.String) }),
  message: NoteTagsMessage
}).make({
  init: () => ({ tags: [] }),
  update: (_, { tags }) => ({ tags }),
  // A consumer places a composed component as it places any headless one.
  // It doesn't know a Listbox is inside: it sees one set of parts, and hears
  // only the picker's `Updated`.
  view: (h, model) =>
    TagPicker(h, {
      props: { options, tags: model.tags },
      onEmit: { Updated: ({ tags }) => NoteTagsMessage.UpdatedTags({ tags }) },
      view: (tagPicker) =>
        h.div.class("note-tags").children(
          h.ul.attr("aria-label", "Tags").children(
            tagPicker.tags.map((tag) =>
              h.li.key(tag.id).children(
                tag.label,
                tagPicker.remove(h.button, tag).children("×")
              )
            )
          ),
          tagPicker.trigger(h.button).children("Add a tag"),
          tagPicker.popup(h.div.attr("aria-label", "Add a tag")).children(
            tagPicker.input(h.input.attr("aria-label", "Filter tags")),
            tagPicker.list(h.ul.attr("aria-label", "Tags to add")).children(
              tagPicker.shown.map((option) =>
                tagPicker.option(
                  h.li.key(option.id).class(
                    tagPicker.active === option.id && "active"
                  ),
                  option
                )
                  .children(option.label)
              )
            )
          ),
          tagPicker.status(h.div).children(tagPicker.announced)
        )
    })
})

// ---------------------------------------------------------------------------
// A scene of the picker
// ---------------------------------------------------------------------------

// `childEmit` sends the picker what the Listbox it owns emits. A scene of
// `NoteTags` runs both: a click on an option goes through the Listbox's
// `update`, then the picker's.
//
// A test runs this with `it.effect`, which provides the scope `Scene.make` needs.
export const pickedAndRemoved = Effect.gen(function*() {
  const s = yield* Scene.make(TagPicker, { options, tags: [] }, {
    elements: Html,
    // The stand-in view draws only what the steps look at.
    view: (tagPicker, h) =>
      h.div(
        tagPicker.tags.map((tag) =>
          tagPicker.remove(h.button.key(tag.id), tag).children("×")
        ),
        tagPicker.status(h.div).children(tagPicker.announced)
      )
  })
  s.childEmit(Listbox, { _tag: "Picked", id: "work" })
    .emitted(TagPickerEvents.Updated({ tags: ["work"] }))
    .expect(Locator.text("Added Work")).toExist()
    // The consumer owns the tags: it passes the new list back as props.
    .props({ options, tags: ["work"] })
    .click(HtmlLocator.role("button", { name: "Remove Work" }))
    .emitted(TagPickerEvents.Updated({ tags: [] }))
    .expect(Locator.text("Removed Work")).toExist()
})
