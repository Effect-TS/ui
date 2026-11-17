/**
 * @title Shared state
 *
 * Share part of a headless component's state with every component below it:
 * a tooltip provider that knows which tooltip is open, tooltips that read it
 * and tell it when they're focused, and a scene of one tooltip with no
 * provider mounted.
 */
import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { Schema } from "effect"

// ---------------------------------------------------------------------------
// The owner: a headless component with `shares`
// ---------------------------------------------------------------------------

const ProviderMessage = Schema.TaggedUnion({
  Enter: { id: Schema.String },
  Leave: { id: Schema.String }
})

// The state is the owner's ordinary Model, so every change to it is an
// `Update` in the log. `shares` picks what the readers below it see. Only a
// headless component can share state: its `view` closure is the subtree it
// shares with. An owner is never restored from history, so a reload doesn't
// reopen a tooltip nobody is focused on.
export const TooltipProvider = Component.define({
  name: "TooltipProvider",
  // Every prop optional, so a scene of a reader has a default value.
  props: Schema.Struct({ delay: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
  message: ProviderMessage,
  // `$.send(TooltipProvider, message)` takes these.
  receives: ["Enter", "Leave"],
  shares: (model) => ({ open: model.open }),
  elements: Html
}).make({
  init: () => ({ open: null }),
  update: (model, message) =>
    ProviderMessage.match(message, {
      Enter: ({ id }) => ({ open: id }),
      Leave: ({ id }) => model.open === id ? { open: null } : model
    }),
  parts: () => ({})
})

// ---------------------------------------------------------------------------
// A reader: `shared` names the owners it reads, `$.send` reaches the owner
// ---------------------------------------------------------------------------

const TooltipMessage = Schema.TaggedUnion({
  Enter: { id: Schema.String },
  Leave: { id: Schema.String }
})

// `h.shared.tips` is the nearest TooltipProvider's value. Reading it, or
// sending to it, puts `Component.Shared<typeof TooltipProvider>` in the
// component's requirements: it compiles only below a TooltipProvider. Reads
// are in `view` and `parts` only, so `update` stays a pure function of what
// the log records.
export const Tooltip = Component.define({
  name: "Tooltip",
  props: Schema.Struct({ label: Schema.String, tip: Schema.String }),
  model: Schema.Null,
  message: TooltipMessage,
  shared: { tips: TooltipProvider },
  elements: Html
}).make({
  init: () => null,
  // Delivered as this update applies, and logged with this update as its source.
  update: (model, message, $) => $.set(model).send(TooltipProvider, message),
  view: (_, h) => {
    const id = h.id("tip")
    return h.span(
      h.button
        .onFocus(TooltipMessage.make({ _tag: "Enter", id }))
        .onBlur(TooltipMessage.make({ _tag: "Leave", id }))
        .attr("aria-describedby", id)
        .children(h.props.label),
      h.shared.tips.open === id && h.span.id(id).attr("role", "tooltip").children(h.props.tip)
    )
  }
})

// ---------------------------------------------------------------------------
// The tree: the owner's closure holds its readers
// ---------------------------------------------------------------------------

// The closure removes the requirement, so `Toolbar` needs nothing.
//
// Every provider update re-runs the closure, and a headless child in it
// re-renders each time. A normal child with equal props is skipped. So put
// normal components directly under a provider, as here, or one normal
// component that holds the rest. With 1,000 headless rows written straight
// into the closure, each provider update took about 10 ms in the
// `headless-rows` benchmark. Behind one normal component it took under 0.1 ms.
//
// Every reader re-renders when the shared value changes, so keep readers few
// and `shares` small. 1,000 reading rows took about 13 ms per change, and the
// cost grows faster than the count above that: 4,000 took about 90 ms. A
// change to the Model that leaves the shared value equal re-renders no reader.
export const Toolbar = Component.define({
  name: "Toolbar",
  model: Schema.Null,
  message: Schema.TaggedUnion({ Noop: {} }),
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    TooltipProvider(h, {
      key: "tips",
      props: {},
      view: () =>
        h.div(
          Tooltip(h, { key: "bold", props: { label: "B", tip: "Bold" } }),
          Tooltip(h, { key: "italic", props: { label: "I", tip: "Italic" } })
        )
    })
})

// ---------------------------------------------------------------------------
// A scene of a reader, with no owner mounted
// ---------------------------------------------------------------------------

// The reader sees the provider's default, `shares(init(props).model, props)`,
// until `shared` gives it a value. Sends to the owner are in `sent` until a
// `sent` step acknowledges them, and the scene never runs the owner's `update`.
export const focused = Scene.make(Tooltip, { label: "B", tip: "Bold" }, (s) => {
  s.fire(Locator.text("B"), "focus")
  const [enter] = s.current.sent
  console.log(enter?.owner?.definition.name) // "TooltipProvider"
  const message = enter!.message as typeof TooltipMessage.Type
  s.sent(TooltipProvider, message)
  // What the provider would make of it, given by hand: the tooltip shows.
  s.shared(TooltipProvider, { open: message.id })
    .expect(Locator.text("Bold")).toExist()
})
