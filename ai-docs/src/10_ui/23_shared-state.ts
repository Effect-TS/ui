/**
 * @title Shared state
 *
 * Share part of a headless component's state with every component below it:
 * a tooltip provider that knows which tooltip is open, tooltips that read it
 * and tell it when they're focused, and a scene of one tooltip with no
 * provider mounted. Then an optional owner, the reports readers give it, and
 * a reader's `onChange`.
 */
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { Effect, Schema } from "effect"

// ---------------------------------------------------------------------------
// The owner: a headless component with `shares`
// ---------------------------------------------------------------------------

const ProviderMessage = UiSchema.TaggedEnum({
  FocusedTooltip: { id: Schema.String },
  BlurredTooltip: { id: Schema.String }
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
  // `$.send(TooltipProvider, message)` takes these. They are facts, named
  // like any other message.
  receives: ["FocusedTooltip", "BlurredTooltip"],
  shares: (model) => ({ open: model.open }),
  elements: Html
}).make({
  init: () => ({ open: null }),
  update: (model, message) =>
    ProviderMessage.match(message, {
      FocusedTooltip: ({ id }) => ({ open: id }),
      BlurredTooltip: ({ id }) => model.open === id ? { open: null } : model
    }),
  parts: () => ({})
})

// ---------------------------------------------------------------------------
// A reader: `shared` names the owners it reads, `$.send` reaches the owner
// ---------------------------------------------------------------------------

const TooltipMessage = UiSchema.TaggedEnum({
  FocusedTooltip: { id: Schema.String },
  BlurredTooltip: { id: Schema.String }
})

// `h.shared.provider` is the nearest TooltipProvider's value. Reading it, or
// sending to it, puts `Component.Shared<"TooltipProvider">` in the
// component's requirements: it compiles only below a TooltipProvider. Reads
// are in `view` and `parts` only, so `update` stays a pure function of what
// the log records.
export const Tooltip = Component.define({
  name: "Tooltip",
  props: Schema.Struct({ label: Schema.String, tip: Schema.String }),
  model: Schema.Null,
  message: TooltipMessage,
  shared: { provider: TooltipProvider },
  elements: Html
}).make({
  init: () => null,
  // Delivered as this update applies, and logged with this update as its source.
  update: (model, message, $) => $.set(model).send(TooltipProvider, message),
  view: (_, h) => {
    const id = h.id("tip")
    return h.span(
      h.button
        .onFocus(TooltipMessage.FocusedTooltip({ id }))
        .onBlur(TooltipMessage.BlurredTooltip({ id }))
        .attr("aria-describedby", id)
        .children(h.props.label),
      h.shared.provider.open === id && h.span.id(id).attr("role", "tooltip").children(h.props.tip)
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
  // No messages, and no no-op variant to stand in for them.
  message: Schema.Never,
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
// A test runs this with `it.effect`, which provides the scope `Scene.make` needs.
export const focused = Effect.gen(function*() {
  const s = yield* Scene.make(Tooltip, { label: "B", tip: "Bold" })
  s.fire(Locator.text("B"), "focus")
  const [enter] = s.current.sent
  console.log(enter?.owner?.definition.name) // "TooltipProvider"
  const message = enter!.message as typeof TooltipMessage.Type
  s.sent(TooltipProvider, message)
  // What the provider would make of it, given by hand: the tooltip shows.
  s.shared(TooltipProvider, { open: message.id })
    .expect(Locator.text("Bold")).toExist()
})

// ---------------------------------------------------------------------------
// An optional owner, reports and onChange
// ---------------------------------------------------------------------------

const GroupMessage = UiSchema.TaggedEnum({ ChangedOpen: { open: Schema.Boolean } })

// `shares` in its long form. `value` is what readers read. `collects` is
// what the owner collects from them: `schema` is the Schema of what each
// reader tells the owner, and `onChange` the owner's message for the current
// reports. Once a render pass has nothing left to render, the runtime calls
// `onChange` with every mounted reader's report, in no promised order, and
// dispatches the message only when it differs from the last one, starting
// from `onChange([])`. So two panels that swap in one render send nothing,
// and a panel that unmounts takes its report with it. The message is an
// `Update` with source `Collected`.
export const PanelGroup = Component.define({
  name: "PanelGroup",
  model: Schema.Struct({ anyOpen: Schema.Boolean }),
  message: GroupMessage,
  shares: {
    value: (model) => ({ anyOpen: model.anyOpen }),
    collects: {
      schema: Schema.Boolean,
      onChange: (collected) => GroupMessage.ChangedOpen({ open: collected.includes(true) })
    }
  },
  elements: Html
}).make({
  init: () => ({ anyOpen: false }),
  update: (_, { open }) => ({ anyOpen: open }),
  parts: (model) => ({ anyOpen: model.anyOpen })
})

const PanelMessage = UiSchema.TaggedEnum({ Toggled: {}, ChangedGroup: { anyOpen: Schema.Boolean } })

// The long form of a `shared` entry, typed by its `owner`.
//
// - `optional: true`: a Panel works with no PanelGroup above it. There
//   `h.shared.group` is `undefined`, a `$.send(PanelGroup, ...)` is dropped
//   and logged as `SendDropped` with reason `absent`, and the Panel needs no
//   `Component.Shared<"PanelGroup">`.
// - `report`: what the Panel tells the owner, from its own Model and props.
//   It fails to compile for an owner whose `shares` has no `collects`.
// - `onChange`: the Panel's message when the owner's value changes, for an
//   `update` that must act on it. `view` and `parts` read `h.shared` as
//   usual. It isn't sent at mount, so `init` can't read the value, and never
//   with an optional owner absent. Changes are delivered in one round per
//   owner before the next render, with the value as it is then: a burst of
//   changes is one message, and a value that changes back sends nothing.
//
// A `report` or `onChange` that answers the shared value with a change of
// its own can loop. The owner counts its `collects.onChange` messages and
// its rounds of the readers' `onChange`, and fails past 100 in one flush, so
// its `fallback` shows.
export const Panel = Component.define({
  name: "Panel",
  props: Schema.Struct({ title: Schema.String }),
  model: Schema.Struct({ open: Schema.Boolean, groupOpen: Schema.Boolean }),
  message: PanelMessage,
  shared: {
    group: {
      owner: PanelGroup,
      optional: true,
      report: (model) => model.open,
      onChange: (value) => PanelMessage.ChangedGroup({ anyOpen: value.anyOpen })
    }
  },
  elements: Html
}).make({
  init: () => ({ open: false, groupOpen: false }),
  update: (model, message) =>
    PanelMessage.match(message, {
      Toggled: () => ({ ...model, open: !model.open }),
      ChangedGroup: ({ anyOpen }) => ({ ...model, groupOpen: anyOpen })
    }),
  view: (model, h) =>
    h.section(
      h.button.onClick(PanelMessage.Toggled()).children(h.props.title),
      model.open && h.p.children(h.shared.group === undefined ? "On its own" : "In a group")
    )
})

// A test of each side. Neither runs the other: `shared` gives the Panel its
// owner's value, and `collected`, a step of a headless component's scene,
// gives the PanelGroup its readers' reports.
export const panels = Effect.gen(function*() {
  const panel = yield* Story.make(Panel, { title: "One" })
  // An optional owner is absent until given: no report.
  console.log(panel.current.reports) // {}
  // The first value of an optional owner sends nothing: in an app the owner is
  // found once, when the reader mounts.
  panel.shared(PanelGroup, { anyOpen: false })
  // A change sends `onChange`'s message. `given`'s third argument gives a
  // value without sending.
  panel.shared(PanelGroup, { anyOpen: true })
  console.log(panel.model.groupOpen) // true
  console.log(panel.current.reports) // { group: false }

  const group = yield* Scene.make(PanelGroup, {}, {
    elements: Html,
    view: (parts, h) => h.p.children(parts.anyOpen ? "open" : "closed")
  })
  // The same message as for no reports: nothing is sent.
  group.collected([false, false])
  group.collected([false, true])
    .expect(Locator.text("open")).toExist()
})
