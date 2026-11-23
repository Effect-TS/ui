/**
 * @title Shared state
 *
 * Share part of a headless component's state with every component below it:
 * a tooltip provider that knows which tooltip is open, tooltips that read it
 * and tell it when they're focused, and a scene of one tooltip with no
 * provider mounted. Then an optional owner, the reports readers give it, a
 * reader's `onChange`, and a component that reads and sends to its own kind.
 */
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { Effect, Schema } from "effect"

// ---------------------------------------------------------------------------
// The owner: a headless component with `shares`
// ---------------------------------------------------------------------------

const TooltipProviderMessage = UiSchema.TaggedEnum({
  FocusedTooltip: { id: Schema.String },
  BlurredTooltip: { id: Schema.String }
})

// The state is the owner's ordinary Model, so every change to it is an
// `Update` in the log. `shares` picks what the readers below it see. Only a
// headless component can share state: its `view` closure is the subtree it
// shares with. An owner restores from history like any other component.
// `restore: false` starts this one from `init` after Back or a reload, so it
// doesn't reopen a tooltip nobody is focused on.
export const TooltipProvider = Component.define({
  name: "TooltipProvider",
  scoped: false,
  // Every prop optional, so a scene of a reader has a default value.
  props: Schema.Struct({ delay: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
  message: TooltipProviderMessage,
  // `receives` lists what `$.send(TooltipProvider, message)` takes. They are
  // facts, named like any other message.
  shares: { value: (model) => ({ open: model.open }), receives: ["FocusedTooltip", "BlurredTooltip"] },
  restore: false,
  elements: Html
}).make({
  init: () => ({ open: null }),
  update: ($, message) =>
    TooltipProviderMessage.match(message, {
      FocusedTooltip: ({ id }) => ({ open: id }),
      BlurredTooltip: ({ id }) => $.model.open === id ? { open: null } : $.model
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

// `h.shared.provider` is the nearest TooltipProvider's value, and
// `$.shared.provider` is the same value in `update`. Reading it, or sending
// to it, puts `Component.Shared<"TooltipProvider">` in the component's
// requirements, which the provider's `view` closure removes. Each `Update` in
// the log records what `$.shared` held, so a replay reads the same value.
export const Tooltip = Component.define({
  name: "Tooltip",
  scoped: false,
  props: Schema.Struct({ label: Schema.String, tip: Schema.String }),
  model: Schema.Null,
  message: TooltipMessage,
  shared: { provider: TooltipProvider },
  elements: Html
}).make({
  init: () => null,
  // `$.shared.provider` is the provider's value as this update runs: a blur
  // of a tooltip that isn't open would change nothing, so it isn't sent. A
  // send is delivered as this update applies, and logged with this update as
  // its source.
  update: ($, message) =>
    message._tag === "BlurredTooltip" && $.shared.provider.open !== message.id
      ? $.model
      : $.set($.model).send(TooltipProvider, message),
  view: (h) => {
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
  scoped: false,
  model: Schema.Null,
  // No messages, and no no-op variant to stand in for them.
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
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

const PanelGroupMessage = UiSchema.TaggedEnum({ ChangedOpen: { open: Schema.Boolean } })

// `shares` in its long form. `value` is what readers read, and `schema` its
// Schema, which encodes it in a reader's `Update` on the Wire. Without one,
// the value is sent as `MessageLog.structural` encodes it, best effort.
// `collects` is what the owner collects from them: `schema` is the Schema of what each
// reader tells the owner, and `onChange` the owner's message for the current
// reports. Once a render pass has nothing left to render, the runtime calls
// `onChange` with every mounted reader's report, in no promised order, and
// dispatches the message only when it differs from the last one, starting
// from `onChange([])`. So two panels that swap in one render send nothing,
// and a panel that unmounts takes its report with it. The message is an
// `Update` with source `Collected`.
export const PanelGroup = Component.define({
  name: "PanelGroup",
  scoped: false,
  model: Schema.Struct({ anyOpen: Schema.Boolean }),
  message: PanelGroupMessage,
  shares: {
    value: (model) => ({ anyOpen: model.anyOpen }),
    schema: Schema.Struct({ anyOpen: Schema.Boolean }),
    collects: {
      schema: Schema.Boolean,
      onChange: (collected) => PanelGroupMessage.ChangedOpen({ open: collected.includes(true) })
    }
  },
  elements: Html
}).make({
  init: () => ({ anyOpen: false }),
  update: (_, { open }) => ({ anyOpen: open }),
  parts: (_, model) => ({ anyOpen: model.anyOpen })
})

const PanelMessage = UiSchema.TaggedEnum({ Toggled: {}, ChangedGroup: { anyOpen: Schema.Boolean } })

// The long form of a `shared` entry, typed by its `owner`.
//
// - `optional: true`: a Panel works with no PanelGroup above it. There
//   `h.shared.group` is `undefined`, a `$.send(PanelGroup, ...)` is dropped
//   and logged as `SendDropped`, and the Panel needs no
//   `Component.Shared<"PanelGroup">`.
// - `report`: what the Panel tells the owner, from its own Model and props.
//   It fails to compile for an owner whose `shares` has no `collects`. Its
//   third argument is the Panel's `id`, the same as `h.id`, for an owner
//   that points at one of the Panel's elements, as a parent checkbox lists
//   the ones it controls in `aria-controls`.
// - `onChange`: the Panel's message when the owner's value changes, for an
//   `update` that must act on the change, as counting the times the group
//   opened does here. To read the current value, `update` has
//   `$.shared.group`, so there's no need to copy it into the Model. It isn't
//   sent at mount, and never with an optional owner absent. Changes are
//   delivered in one round per owner before the next render, with the value
//   as it is then: a burst of changes is one message, and a value that
//   changes back sends nothing. When another reader changes the owner within
//   that round, `$.shared` is already newer than the message being handled.
//
// A `report` or `onChange` that answers the shared value with a change of
// its own can loop. The owner counts its `collects.onChange` messages and
// its rounds of the readers' `onChange`, and fails past 100 in one flush, so
// its `fallback` shows.
export const Panel = Component.define({
  name: "Panel",
  scoped: false,
  props: Schema.Struct({ title: Schema.String }),
  model: Schema.Struct({ open: Schema.Boolean, groupOpened: Schema.Number }),
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
  init: () => ({ open: false, groupOpened: 0 }),
  update: ($, message) =>
    PanelMessage.match(message, {
      Toggled: () => $.evolve({ open: (open) => !open }),
      ChangedGroup: ({ anyOpen }) => anyOpen ? $.evolve({ groupOpened: (times) => times + 1 }) : $.model
    }),
  view: (h, model) =>
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
  console.log(panel.model.groupOpened) // 1
  console.log(panel.current.reports) // { group: false }

  const group = yield* Scene.make(PanelGroup, {}, {
    elements: Html,
    view: (panelGroup, h) => h.p.children(panelGroup.anyOpen ? "open" : "closed")
  })
  // The same message as for no reports: nothing is sent.
  group.collected([false, false])
  group.collected([false, true])
    .expect(Locator.text("open")).toExist()
})

// ---------------------------------------------------------------------------
// A component that reads its own kind
// ---------------------------------------------------------------------------

const MenuMessage = UiSchema.TaggedEnum({
  ChangedOpenBelow: { count: Schema.Number },
  PickedItem: { item: Schema.String }
})
const MenuEvents = UiSchema.TaggedEnum({ Picked: { item: Schema.String } })

// A menu reads the menu it's nested in, and tells it how many menus below it
// are open. `owner: "self"` names the component being defined, which can't
// name itself yet. The outermost menu has none above it, so the entry is
// `optional: true`. `shares` comes first, so `report` is typed by `collects`.
// `receives` lists the messages a menu takes from the one nested in it.
export const Menu = Component.define({
  name: "Menu",
  scoped: false,
  props: Schema.Struct({ open: Schema.Boolean }),
  // How many menus below this one are open.
  model: Schema.Number,
  message: MenuMessage,
  events: MenuEvents,
  shares: {
    value: (_, props) => ({ open: props.open }),
    receives: ["PickedItem"],
    collects: {
      schema: Schema.Number,
      onChange: (counts) => MenuMessage.ChangedOpenBelow({ count: counts.reduce((sum, count) => sum + count, 0) })
    }
  },
  shared: { parent: { owner: "self", optional: true, report: (below, props) => (props.open ? below + 1 : 0) } },
  elements: Html
}).make({
  init: () => 0,
  update: ($, message) =>
    MenuMessage.match(message, {
      ChangedOpenBelow: ({ count }) => count,
      // A pick goes up to the outermost menu, which tells its consumer.
      // `$.send("self", message)` sends to the menu this one is nested in:
      // the one `$.shared.parent` reads. It needs nothing above, as an
      // optional owner doesn't: from the outermost menu the send would be
      // dropped and logged as `SendDropped`, so that one emits instead.
      PickedItem: ({ item }) =>
        $.shared.parent === undefined
          ? $.emit(MenuEvents.Picked({ item }))
          : $.send("self", MenuMessage.PickedItem({ item }))
    }),
  parts: (p, below) => ({
    nested: p.shared.parent !== undefined,
    openBelow: below,
    item: p.part("button", (b, item: string) => b.onClick(MenuMessage.PickedItem({ item })))
  })
})

// In a scene, the component itself is the owner its `"self"` entry reads,
// and `sent(Menu, message)` acknowledges a send to it.
export const nestedMenu = Effect.gen(function*() {
  const menu = yield* Scene.make(Menu, { open: true }, {
    elements: Html,
    view: (menu, h) => h.div(h.p.children(menu.nested ? "nested" : "outermost"), menu.item(h.button("Copy"), "copy"))
  })
  menu.expect(Locator.text("outermost")).toExist()
  // The outermost menu tells its consumer.
  menu.click("Copy").emitted(MenuEvents.Picked({ item: "copy" }))
  menu.shared(Menu, { open: true })
    .expect(Locator.text("nested")).toExist()
  // A nested one sends the pick up.
  menu.click("Copy").sent(Menu, MenuMessage.PickedItem({ item: "copy" }))
})
