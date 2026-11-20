/**
 * @title Children that outlive their place in the view
 *
 * Keep a hidden tab's draft: give the tab `lifetime: "model"`, list it in
 * its parent's `children`, and place it with `h.children`. A Story runs the
 * parent with its listed children, hidden ones included.
 */
import { Child, Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

// A "view" component lives while a view renders it: it is called with `h`
// and unmounts when the view stops calling it. A "model" component lives
// while its parent lists it in `children`, placed or not. Pick "model" for
// a tab, a wizard step or a panel the user comes back to.
export const ProfileMessage = UiSchema.TaggedEnum({ ChangedName: { name: Schema.String }, ClickedSave: {} })
export const ProfileEvents = UiSchema.TaggedEnum({ Saved: { name: Schema.String } })

export const Profile = Component.define({
  name: "Profile",
  lifetime: "model",
  props: Schema.Struct({ initial: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
  message: ProfileMessage,
  events: ProfileEvents,
  elements: Html
}).make({
  init: ($) => ({ name: $.props.initial }),
  update: (model, message, $) =>
    ProfileMessage.match(message, {
      ChangedName: ({ name }) => ({ name }),
      ClickedSave: () => $.emit(ProfileEvents.Saved({ name: model.name }))
    }),
  view: (model, h) =>
    h.form(
      h.input.attr("value", model.name).onInput(({ value }) => ProfileMessage.ChangedName({ name: value })),
      h.button.attr("type", "button").onClick(ProfileMessage.ClickedSave()).children("Save")
    )
})

export const Billing = Component.define({
  name: "Billing",
  lifetime: "model",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.p("Billing") })

export const SettingsMessage = UiSchema.TaggedEnum({
  ClickedTab: { tab: Schema.Literals(["profile", "billing"]) },
  SavedProfile: { name: Schema.String }
})

export const Settings = Component.define({
  name: "Settings",
  lifetime: "view",
  model: Schema.Struct({ tab: Schema.Literals(["profile", "billing"]), saved: Schema.String }),
  message: SettingsMessage,
  elements: Html
}).make({
  // Props and `onEmit` are functions of the parent's Model, so a hidden
  // child gets the same props as a shown one. A bare component is
  // `Child.one(C)`. `Child.optional` lists a child while its props aren't
  // null, and `Child.keyed` one child per `[key, props]` entry.
  children: {
    profile: Child.one(Profile, {
      props: (model) => ({ initial: model.saved }),
      onEmit: (event) => SettingsMessage.SavedProfile({ name: event.name })
    }),
    billing: Billing
  },
  init: () => ({ tab: "profile" as const, saved: "Ada" }),
  update: (model, message) =>
    SettingsMessage.match(message, {
      ClickedTab: ({ tab }) => ({ ...model, tab }),
      SavedProfile: ({ name }) => ({ ...model, saved: name })
    }),
  // The view places each listed child at most once per render. One it
  // doesn't place keeps its Model, its Commands in flight and what the user
  // typed, out of the document.
  view: (model, h) =>
    h.main(
      h.button.onClick(SettingsMessage.ClickedTab({ tab: "profile" })).children("Profile"),
      h.button.onClick(SettingsMessage.ClickedTab({ tab: "billing" })).children("Billing"),
      model.tab === "profile" ? h.children.profile() : h.children.billing()
    )
})

describe("Settings", () => {
  // `s.children` holds each listed child's Model by key, and `sendChild`
  // delivers a message to one, shown or hidden.
  it.effect("keeps the profile draft while the billing tab shows", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Settings, {})
      s.sendChild("profile", ProfileMessage.ChangedName({ name: "Grace" }))
        .send(SettingsMessage.ClickedTab({ tab: "billing" }))
      assert.deepStrictEqual(s.children.profile, { name: "Grace" })
      s.sendChild("profile", ProfileMessage.ClickedSave())
      assert.strictEqual(s.model.saved, "Grace")
    }))
})
