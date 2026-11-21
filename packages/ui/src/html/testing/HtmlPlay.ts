/**
 * `Play` with the HTML vocabulary: steps that send what the browser host
 * sends for each user action, and assertions on fields.
 *
 * `HtmlPlay.HtmlPlay` extends `Play.Play`, so every Play step works here.
 * Each step is the `HtmlScene` step of the same name, sent to the tree on
 * `TestHost`. `click` runs the browser's defaults as `HtmlScene.click`
 * does: it throws on a disabled control, a submit button submits its form
 * with the fields read from the tree, a checkbox or radio button fires
 * `input` and `change`, and a `popovertarget` button toggles its popover.
 *
 * Two things differ from a Scene, as they do in a browser. `type` and
 * `change` write the field's `value`, and a click on a checkbox or radio
 * button its `checked`, unchecking the rest of a radio group, before the
 * event, so an uncontrolled field keeps what the user entered.
 * And the events of one click run with no render between them, so a submit
 * reads the fields as they were before the click's own message.
 *
 * **Example** (Signing in)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html } from "@effect/ui/html"
 * import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
 * import { Locator, TestHost } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   ChangedEmail: { value: Schema.String },
 *   SubmittedForm: {}
 * })
 *
 * const SignIn = Component.define({
 *   name: "SignIn",
 *   model: Schema.Struct({ email: Schema.String, signedIn: Schema.Boolean }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ email: "", signedIn: false }),
 *   update: (model, message) =>
 *     Message.match(message, {
 *       ChangedEmail: ({ value }) => ({ ...model, email: value }),
 *       SubmittedForm: () => ({ ...model, signedIn: true })
 *     }),
 *   view: (model, h) =>
 *     model.signedIn
 *       ? h.p(`Welcome, ${model.email}`)
 *       : h.form.onSubmit(Message.SubmittedForm()).children(
 *         h.label.attr("for", "email").children("Email"),
 *         h.input.attr("id", "email").value(model.email).onInput(({ value }) => Message.ChangedEmail({ value })),
 *         h.button.children("Sign In")
 *       )
 * })
 *
 * Effect.gen(function*() {
 *   const play = yield* HtmlPlay.make(SignIn, {})
 *   yield* play.type(HtmlLocator.label("Email"), "alice@example.com")
 *   yield* play.click(HtmlLocator.role("button", { name: "Sign In" }))
 *   yield* play.expect(Locator.text("Welcome, alice@example.com")).toExist()
 * }).pipe(Effect.scoped, Effect.provide(TestHost.layer()), Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Component from "../../Component.ts"
import * as internal from "../../internal/play.ts"
import * as scene from "../../internal/scene.ts"
import * as Locator from "../../testing/Locator.ts"
import type * as Play from "../../testing/Play.ts"
import type * as TestHost from "../../testing/TestHost.ts"
import type * as View from "../../View.ts"
import type * as Html from "../Html.ts"
import * as defaults from "../internal/defaults.ts"
import * as HtmlLocator from "./HtmlLocator.ts"

/**
 * The assertions `expect(locator)` offers in an `HtmlPlay`: the Play's,
 * plus checks on fields. The checks on fields want exactly one match.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Expect extends Play.Expect {
  /** Asserts the field's current value, as `HtmlLocator.value` reads it. */
  toHaveValue(value: string): Effect.Effect<void, Play.StepError>
  /** Asserts that the checkbox or radio button is checked, or isn't with `false`. */
  toBeChecked(checked?: boolean): Effect.Effect<void, Play.StepError>
  /** Asserts that the element is disabled, or isn't with `false`. */
  toBeDisabled(disabled?: boolean): Effect.Effect<void, Play.StepError>
  /** Asserts the element's accessible name, as `HtmlLocator.nameOf` computes it. */
  toHaveAccessibleName(name: string | RegExp): Effect.Effect<void, Play.StepError>
}

/** The modifier keys of a key payload, each `false` unless given. */
type Modifiers = Partial<Pick<Html.KeyPayload, "shift" | "ctrl" | "alt" | "meta">>

/**
 * A cursor over an HTML tree on `TestHost`: the Play's steps, plus a step
 * per user action the browser host turns into an event. Each one is an
 * interaction.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlPlay<Model, Msg, Events> extends Play.Play<Model, Msg, Events> {
  /**
   * Clicks the one element `target` matches, as a browser does: the `click`
   * goes to the innermost element that handles it, then the defaults run,
   * unless a handler cancelled the click. A string means
   * `Locator.text(target)`. Throws on a disabled control, and when nothing
   * handles the click or any of its defaults.
   */
  click(target: string | Locator.Locator): Effect.Effect<void, Play.StepError>
  /**
   * Sets a field's value as typing does: writes `value` to the field, then
   * sends `input` with it. An `input` also sends its current `checked`.
   */
  type(locator: Locator.Locator, value: string): Effect.Effect<void, Play.StepError>
  /**
   * Sends `change`, as a field does once its edit is committed. A string is
   * the new value; an object also sets `checked` on an `input`.
   */
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): Effect.Effect<void, Play.StepError>
  /** Presses `key`: sends `keydown` with the modifier keys given, each `false` otherwise. */
  keydown(locator: Locator.Locator, key: string, modifiers?: Modifiers): Effect.Effect<void, Play.StepError>
  /**
   * Submits the form `locator` matches, or the one the matched element is
   * in, as pressing Enter in it would: `submit` goes to the form with the
   * fields read from the tree. No button counts as the submitter.
   */
  submit(locator: Locator.Locator): Effect.Effect<void, Play.StepError>
  /** Sends `focus`. */
  focus(locator: Locator.Locator): Effect.Effect<void, Play.StepError>
  /** Sends `blur`. */
  blur(locator: Locator.Locator): Effect.Effect<void, Play.StepError>
  /**
   * Drops `payload` on the element `locator` matches, as `HtmlScene.drop`
   * does: to the innermost element, the matched one or an ancestor, whose
   * `onDrop` accepts one of the drag's types. Throws when none does.
   */
  drop(locator: Locator.Locator, payload?: Partial<Html.DropPayload>): Effect.Effect<void, Play.StepError>

  /** Asserts on the elements `locator` matches, once the tree has settled. */
  expect(locator: Locator.Locator): Expect
}

class HtmlPlayCursor extends internal.PlayCursor {
  override click(target: string | Locator.Locator): Effect.Effect<void, Play.StepError> {
    const locator = typeof target === "string" ? Locator.text(target) : target
    return this.interact("click", this.click, () => {
      const node = this.findOne(locator, "click")
      const container = this.root.container
      const path = internal.ancestors(node)
      return defaults.planClick(container, node, path, locator.description, this.name("click")).map((planned) => {
        const payload = () => planned.payload(container, (node) => node)
        const element = planned.node as TestHost.TestElement
        return {
          node: element,
          description: planned.description,
          event: planned.event,
          payload,
          optional: true,
          isDefault: planned.isDefault,
          edit: planned.isDefault && planned.event === "input"
            ? () => {
              const { checked } = payload() as Html.InputPayload
              if (checked && element.attrs.type?.toLowerCase() === "radio" && element.attrs.name !== undefined) {
                const form = defaults.formOf(internal.ancestors(element), container)
                for (const other of Locator.elements(container) as ReadonlyArray<TestHost.TestElement>) {
                  if (
                    other.tag === "input" && other.attrs.type?.toLowerCase() === "radio" &&
                    other.attrs.name === element.attrs.name &&
                    defaults.formOf(internal.ancestors(other), container) === form
                  ) other.props.checked = false
                }
              }
              element.props.checked = checked
            }
            : undefined
        }
      })
    })
  }
  type(locator: Locator.Locator, value: string): Effect.Effect<void, Play.StepError> {
    return this.one(
      "type",
      this.type,
      locator,
      "input",
      (node) => node.tag === "input" ? { value, checked: HtmlLocator.checked(node) === true } : { value },
      (node) => {
        node.props.value = value
      }
    )
  }
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): Effect.Effect<void, Play.StepError> {
    const given = typeof value === "string" ? { value } : value
    return this.one("change", this.change, locator, "change", (node) =>
      node.tag === "input"
        ? {
          value: given.value ?? HtmlLocator.value(node) ?? "",
          checked: given.checked ?? HtmlLocator.checked(node) === true
        }
        : { value: given.value ?? HtmlLocator.value(node) ?? "" }, (node, payload) => {
      const { checked, value } = payload as Partial<Html.InputPayload>
      node.props.value = value
      if (node.tag === "input") node.props.checked = checked
    })
  }
  keydown(locator: Locator.Locator, key: string, modifiers?: Modifiers): Effect.Effect<void, Play.StepError> {
    const payload: Html.KeyPayload = {
      key,
      shift: modifiers?.shift === true,
      ctrl: modifiers?.ctrl === true,
      alt: modifiers?.alt === true,
      meta: modifiers?.meta === true,
      composing: false
    }
    return this.one("keydown", this.keydown, locator, "keydown", () => payload)
  }
  submit(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.interact("submit", this.submit, () => {
      const node = this.findOne(locator, "submit")
      const container = this.root.container
      const form = defaults.formOf(internal.ancestors(node), container) as TestHost.TestElement | undefined
      if (form === undefined) throw new Error(`${this.name("submit")}: ${locator.description} isn't in a form`)
      return [{
        node: form,
        description: `the form of ${locator.description}`,
        event: "submit",
        payload: () => defaults.formFields(container, form, undefined)
      }]
    })
  }
  focus(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.one("focus", this.focus, locator, "focus", () => ({}))
  }
  blur(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.one("blur", this.blur, locator, "blur", () => ({}))
  }
  drop(locator: Locator.Locator, payload?: Partial<Html.DropPayload>): Effect.Effect<void, Play.StepError> {
    const full: Html.DropPayload = { data: {}, files: [], x: 0, y: 0, width: 0, height: 0, ...payload }
    const types = Object.keys(full.data).concat(full.files.length > 0 ? ["Files"] : [])
    const lowered = types.map((type) => type.toLowerCase())
    return this.interact("drop", this.drop, () => {
      const node = this.findOne(locator, "drop")
      const target = internal.ancestors(node).find((at) =>
        Object.hasOwn(at.handlers, "drop") &&
        ((at.eventOptions.drop as Html.DropTargetOptions | undefined)?.accepts ?? []).some((type) =>
          lowered.includes(type.toLowerCase())
        )
      )
      if (target === undefined) {
        throw new Error(
          `${this.name("drop")}: nothing at ${locator.description} accepts ${
            types.length === 0 ? "a drag with no types" : types.map((type) => JSON.stringify(type)).join(", ")
          }`
        )
      }
      return [{
        node: target,
        description: `the drop target at ${locator.description}`,
        event: "drop",
        payload: () => full
      }]
    })
  }
  override expect(locator: Locator.Locator): object {
    return this.expectation(locator, { ...scene.matchers, ...defaults.fieldMatchers })
  }
}

/**
 * Mounts `component` on `TestHost` with `props`, settles, and returns an
 * HTML cursor over it. It takes what `Play.make` takes, and runs the same
 * end check when the scope closes.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RP = never,
  Rcv = never
>(
  component: Component.Component<Name, Props, Model, Msg, Events, R, V, any, Rcv>,
  props: Props | Effect.Effect<Props, never, RP>
): Effect.Effect<HtmlPlay<Model, Msg, Events>, Play.StepError, R | RP | TestHost.TestHost | Scope.Scope> =>
  internal.begin(HtmlPlayCursor, "HtmlPlay", make, component, props) as any
