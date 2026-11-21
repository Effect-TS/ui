import { Schema } from "effect"

/**
 * @title Who owns the state
 *
 * Compare a controlled modal, a workflow started by a send, and a provider
 * that owns visibility. Contrast an initial prop with a live prop and see
 * how competing routes for the same value or request can still compile.
 */
// "Guaranteed" in a comment means the types or the runtime hold it whatever
// you write. "Convention" means this file's choice, which the API doesn't
// enforce.
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"

// ---------------------------------------------------------------------------
// A controlled dialog: the caller decides `open`, and closing is a request
// ---------------------------------------------------------------------------
const DialogMessage = UiSchema.TaggedEnum({ CancelledDialog: {}, ClosedDialog: {}, ClickedConfirm: {} })
export const DialogEvents = UiSchema.TaggedEnum({ Dismissed: {}, Confirmed: {} })

export const ConfirmDialog = Component.define({
  name: "ConfirmDialog",
  props: Schema.Struct({ open: Schema.Boolean }),
  // Convention: no copy of `open` in the Model, so the prop is the one source.
  model: Schema.Null,
  message: DialogMessage,
  events: DialogEvents,
  elements: Html
}).make({
  init: () => null,
  update: (model, message, $) =>
    DialogMessage.match(message, {
      CancelledDialog: () => $.emit(DialogEvents.Dismissed()),
      // A close while `open` is still true is the browser's. One after the
      // caller set `open` to false only confirms the caller's decision.
      ClosedDialog: () => $.props.open ? $.emit(DialogEvents.Dismissed()) : model,
      ClickedConfirm: () => $.emit(DialogEvents.Confirmed())
    }),
  view: (_, h) =>
    h.dialog.attr("aria-label", "Confirm").modal(h.props.open)
      .onCancel(DialogMessage.CancelledDialog())
      .onClose(DialogMessage.ClosedDialog())
      .children(h.button.onClick(DialogMessage.ClickedConfirm()).children("Confirm"))
})

// ---------------------------------------------------------------------------
// A parent opening a child modal: the parent decides `open`
// ---------------------------------------------------------------------------
const PageMessage = UiSchema.TaggedEnum({ ClickedDelete: {}, DismissedConfirm: {}, ConfirmedDelete: {} })

export const Page = Component.define({
  name: "Page",
  model: Schema.Struct({ confirming: Schema.Boolean, deleted: Schema.Boolean }),
  message: PageMessage,
  elements: Html
}).make({
  init: () => ({ confirming: false, deleted: false }),
  update: (_model, message, $) =>
    PageMessage.match(message, {
      ClickedDelete: () => $.evolve({ confirming: true }),
      // The page decides: returning `model` here refuses the dismissal.
      DismissedConfirm: () => $.evolve({ confirming: false }),
      ConfirmedDelete: () => ({ confirming: false, deleted: true })
    }),
  view: (model, h) =>
    h.div(
      h.button.onClick(PageMessage.ClickedDelete()).children("Delete"),
      model.deleted && h.p.children("Deleted"),
      ConfirmDialog(h, {
        props: { open: model.confirming },
        // Guaranteed: the record needs a handler for every event, so a third
        // event on ConfirmDialog is a type error here until it has one.
        onEmit: {
          Dismissed: () => PageMessage.DismissedConfirm(),
          Confirmed: () => PageMessage.ConfirmedDelete()
        }
      })
    )
})

// ---------------------------------------------------------------------------
// A child owning an encapsulated workflow, which the parent only starts
// ---------------------------------------------------------------------------
const WizardMessage = UiSchema.TaggedEnum({ RequestedStart: {}, ClickedNext: {}, ClickedCancel: {} })
export const WizardEvents = UiSchema.TaggedEnum({ Finished: {}, Cancelled: {} })

export const Wizard = Component.define({
  name: "Wizard",
  // `steps` is the caller's to decide, so it is a prop.
  props: Schema.Struct({ steps: Schema.Number }),
  // Convention: no `open` or `step` prop, because nobody outside decides
  // them. The parent hears the outcome through `events`.
  model: Schema.Struct({ step: Schema.NullOr(Schema.Number) }),
  message: WizardMessage,
  events: WizardEvents,
  // Guaranteed: the parent can send only this tag.
  receives: ["RequestedStart"],
  elements: Html
}).make({
  init: () => ({ step: null }),
  update: (model, message, $) =>
    WizardMessage.match(message, {
      RequestedStart: () => (model.step === null ? { step: 0 } : model),
      // Guaranteed: `$.props` is the props as of this message, not as of
      // mount. A prop change by itself dispatches nothing.
      ClickedNext: () =>
        model.step === null
          ? model
          : model.step + 1 < $.props.steps
          ? { step: model.step + 1 }
          : $.set({ step: null }).emit(WizardEvents.Finished()),
      ClickedCancel: () => $.set({ step: null }).emit(WizardEvents.Cancelled())
    }),
  view: (model, h) =>
    h.dialog.attr("aria-label", "Import").modal(model.step !== null)
      .onCancel(WizardMessage.ClickedCancel())
      .children(
        model.step !== null && h.p.children(`Step ${model.step + 1} of ${h.props.steps}`),
        model.step !== null && h.button.onClick(WizardMessage.ClickedNext()).children("Next")
      )
})

const Import = Wizard.ref("Import")
const HostMessage = UiSchema.TaggedEnum({ ClickedImport: {}, FinishedImport: {} })

export const Host = Component.define({
  name: "Host",
  model: Schema.Struct({ imported: Schema.Number }),
  message: HostMessage,
  elements: Html
}).make({
  init: () => ({ imported: 0 }),
  update: (model, message, $) =>
    HostMessage.match(message, {
      // An occurrence, sent once, with no flag in the host's Model.
      ClickedImport: () => $.send(Import, WizardMessage.RequestedStart()),
      FinishedImport: () => ({ imported: model.imported + 1 })
    }),
  view: (model, h) =>
    h.div(
      h.button.onClick(HostMessage.ClickedImport()).children("Import"),
      h.p.children(`Imported ${model.imported}`),
      Wizard(h, {
        ref: Import,
        props: { steps: 3 },
        onEmit: {
          Finished: () => HostMessage.FinishedImport(),
          // A handler returns `undefined` to ignore an event on purpose.
          Cancelled: () => undefined
        }
      })
    )
})

// ---------------------------------------------------------------------------
// A provider owning visibility. Descendants send it occurrences, and a reader
// passes `open` on to the controlled dialog as a prop.
// ---------------------------------------------------------------------------
const ModalMessage = UiSchema.TaggedEnum({ RequestedOpen: {}, RequestedClose: {} })

// The provider is the one writer of `open`. Descendants read it without
// owning it. Guaranteed: an owner's Model isn't restored from history, so
// after Back or a reload this starts closed.
export const ModalProvider = Component.define({
  name: "ModalProvider",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: ModalMessage,
  receives: ["RequestedOpen", "RequestedClose"],
  shares: (model) => ({ open: model.open }),
  elements: Html
}).make({
  init: () => ({ open: false }),
  update: (_model, message) =>
    ModalMessage.match(message, {
      RequestedOpen: () => ({ open: true }),
      RequestedClose: () => ({ open: false })
    }),
  // Only `Above`, at the end of this file, reads these parts. Without it
  // this is `parts: () => ({})`.
  parts: (model) => ({ open: model.open })
})

const OpenButtonMessage = UiSchema.TaggedEnum({ ClickedOpen: {} })

// Guaranteed: a sender needs no `shared` entry. The send puts the owner in
// this component's requirements, which only the owner's `view` closure
// removes.
export const OpenButton = Component.define({
  name: "OpenButton",
  model: Schema.Null,
  message: OpenButtonMessage,
  elements: Html
}).make({
  init: () => null,
  update: (_model, message, $) =>
    OpenButtonMessage.match(message, {
      ClickedOpen: () => $.send(ModalProvider, ModalMessage.RequestedOpen())
    }),
  view: (_, h) => h.button.onClick(OpenButtonMessage.ClickedOpen()).children("Open")
})

// One message for both events: this host does the same thing for each.
const ModalHostMessage = UiSchema.TaggedEnum({ ClosedDialog: {} })

// Convention: the reader is the dialog's parent, so the dialog still has one
// source for `open`, its prop, and knows nothing about the provider.
export const ModalHost = Component.define({
  name: "ModalHost",
  model: Schema.Null,
  message: ModalHostMessage,
  shared: { modal: ModalProvider },
  elements: Html
}).make({
  init: () => null,
  update: (_model, message, $) =>
    ModalHostMessage.match(message, {
      ClosedDialog: () => $.send(ModalProvider, ModalMessage.RequestedClose())
    }),
  view: (_, h) =>
    ConfirmDialog(h, {
      props: { open: h.shared.modal.open },
      onEmit: {
        Dismissed: () => ModalHostMessage.ClosedDialog(),
        Confirmed: () => ModalHostMessage.ClosedDialog()
      }
    })
})

export const Shell = Component.define({
  name: "Shell",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => ModalProvider(h, { view: () => h.div(OpenButton(h, {}), ModalHost(h, {})) })
})

// ---------------------------------------------------------------------------
// A seed is not a mirror
// ---------------------------------------------------------------------------

// The prop is read in `init` only and the Model owns the value from then on.
// Name the prop `initial*` to make that handoff clear.
const CounterMessage = UiSchema.TaggedEnum({ ClickedIncrement: {} })
export const Counter = Component.define({
  name: "Counter",
  props: Schema.Struct({ initialCount: Schema.Number }),
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterMessage,
  elements: Html
}).make({
  init: ($) => ({ count: $.props.initialCount }),
  update: (model, message) =>
    CounterMessage.match(message, {
      ClickedIncrement: () => ({ count: model.count + 1 })
    }),
  view: (model, h) => h.button.onClick(CounterMessage.ClickedIncrement()).children(String(model.count))
})

// ---------------------------------------------------------------------------
// What compiles today and shouldn't be written
// ---------------------------------------------------------------------------

// Mirroring a controlled prop. A live `open` prop, a Model copy of it, and
// received messages that set the copy: three sources for one value, and no
// type or diagnostic objects.
const DualMessage = UiSchema.TaggedEnum({ RequestedOpen: {}, RequestedClose: {} })
export const Dual = Component.define({
  name: "Dual",
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: DualMessage,
  receives: ["RequestedOpen", "RequestedClose"],
  elements: Html
}).make({
  init: ($) => ({ open: $.props.open }),
  update: (_model, message) =>
    DualMessage.match(message, {
      RequestedOpen: () => ({ open: true }),
      RequestedClose: () => ({ open: false })
    }),
  // The prop is read again after `init`. That makes this a mirror, where
  // Counter above is a seed.
  view: (model, h) => h.dialog.modal(model.open || h.props.open)
})

const ProviderRef = ModalProvider.ref("Modal")
const AboveMessage = UiSchema.TaggedEnum({ ClickedOpen: {}, ClosedDialog: {} })
export const Above = Component.define({
  name: "Above",
  model: Schema.Null,
  message: AboveMessage,
  elements: Html
}).make({
  init: () => null,
  update: (_model, message, $) =>
    AboveMessage.match(message, {
      // Relying on sender identity. This is the message OpenButton sends, and
      // both reach the provider with source `Send`. Guaranteed: one
      // `receives` list serves the parent's ref and every descendant, so the
      // provider can't tell them apart.
      ClickedOpen: () => $.send(ProviderRef, ModalMessage.RequestedOpen()),
      ClosedDialog: () => $.send(ProviderRef, ModalMessage.RequestedClose())
    }),
  view: (_, h) =>
    ModalProvider(h, {
      ref: ProviderRef,
      view: (modalProvider) =>
        h.div(
          h.button.onClick(AboveMessage.ClickedOpen()).children("Open from above"),
          OpenButton(h, {}),
          // Routing around the owner. The closure hands the owner's parts to
          // a child as props: the value a reader gets through `h.shared`, by
          // a second route. The dialog's events now land on `Above`, over the
          // owner, so closing takes a round trip through a ref send.
          ConfirmDialog(h, {
            props: { open: modalProvider.open },
            onEmit: {
              Dismissed: () => AboveMessage.ClosedDialog(),
              Confirmed: () => AboveMessage.ClosedDialog()
            }
          })
        )
    })
})
