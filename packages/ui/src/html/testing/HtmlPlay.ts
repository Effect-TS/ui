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
 * Some things differ from a Scene, as they do in a browser. `type` and
 * `change` write the field's `value`, and a click on a checkbox or radio
 * button its `checked`, unchecking the rest of a radio group, before the
 * event, so an uncontrolled field keeps what the user entered. A controlled
 * field goes back to what the view set once the step settles, unless the
 * Model took the edit. A `popovertarget` click opens or closes the popover,
 * so the next click sees it. The events of one click run with no render
 * between them, so a submit reads the fields as they were before the
 * click's own message. And `focus`, `blur` and the browser's other events
 * that don't bubble go to the matched element only.
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
import * as Locator from "../../testing/Locator.ts"
import type * as Play from "../../testing/Play.ts"
import type * as TestHost from "../../testing/TestHost.ts"
import type * as View from "../../View.ts"
import type * as Html from "../Html.ts"
import * as defaults from "../internal/defaults.ts"
import { ownEvents } from "../internal/ownEvents.ts"
import type * as HtmlScene from "./HtmlScene.ts"

/**
 * The assertions `expect(locator)` offers in an `HtmlPlay`: the Play's,
 * plus checks on fields. The checks on fields want exactly one match.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Expect = HtmlScene.Expect<Effect.Effect<void, Play.StepError>>

type KeyDetails = Partial<Omit<Html.KeyPayload, "key">>

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
   * the new value; an object also sets `checked` on an `input`, and `files`
   * on a file input. `change(locator, { files })` chooses files in a file
   * input.
   */
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): Effect.Effect<void, Play.StepError>
  /**
   * Presses `key`: sends `keydown` with the modifier keys, `composing`,
   * `repeat` and selection given, each `false` or `null` otherwise. `editable`
   * defaults from the matched element unless given.
   */
  keydown(locator: Locator.Locator, key: string, details?: KeyDetails): Effect.Effect<void, Play.StepError>
  /**
   * Submits the form `locator` matches, or the one the matched element is
   * in, as pressing Enter in it would: `submit` goes to the form with the
   * fields read from the tree. No button counts as the submitter.
   */
  submit(locator: Locator.Locator): Effect.Effect<void, Play.StepError>
  /** Sends `focus` to the element `locator` matches, which must handle it. */
  focus(locator: Locator.Locator): Effect.Effect<void, Play.StepError>
  /** Sends `blur` to the element `locator` matches, which must handle it. */
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
  protected override bubbles(event: string): boolean {
    return !ownEvents.has(event)
  }
  override click(target: string | Locator.Locator): Effect.Effect<void, Play.StepError> {
    const locator = typeof target === "string" ? Locator.text(target) : target
    return this.interact("click", () => {
      const node = this.findOne(locator, "click")
      const container = this.root.container
      return defaults.planClick(container, node, internal.ancestors(node), locator.description, this.name("click"))
        .map(({ checks, description, event, isDefault, node, payload }) => ({
          node: node as TestHost.TestElement,
          description,
          event,
          payload: () => payload(container, (node) => node),
          isDefault,
          edit: checks
            ? () =>
              checks().map(([node, checked]) => {
                const element = node as TestHost.TestElement
                element.props.checked = checked
                return element
              })
            : event === "toggle"
            ? () => {
              const element = node as TestHost.TestElement
              element.props.popoverOpen = (payload(container, (node) => node) as Html.PopoverTogglePayload).open
              return [element]
            }
            : undefined
        }))
    })
  }
  type(locator: Locator.Locator, value: string): Effect.Effect<void, Play.StepError> {
    return this.one("type", locator, "input", (node) => defaults.inputPayload(node, value), (node) => {
      node.props.value = value
    })
  }
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): Effect.Effect<void, Play.StepError> {
    return this.one("change", locator, "change", (node) => defaults.changePayload(node, value), (node, payload) => {
      node.props.value = payload.value
      if ("checked" in payload) node.props.checked = payload.checked
    })
  }
  keydown(locator: Locator.Locator, key: string, details?: KeyDetails): Effect.Effect<void, Play.StepError> {
    return this.one(
      "keydown",
      locator,
      "keydown",
      (node) => defaults.keyPayload(key, details, internal.ancestors(node))
    )
  }
  submit(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.interact("submit", () => {
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
    return this.one("focus", locator, "focus", () => ({}))
  }
  blur(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.one("blur", locator, "blur", () => ({}))
  }
  drop(locator: Locator.Locator, payload?: Partial<Html.DropPayload>): Effect.Effect<void, Play.StepError> {
    const drop = defaults.drop(payload)
    return this.interact("drop", () => {
      const target = internal.ancestors(this.findOne(locator, "drop")).find((at) =>
        Object.hasOwn(at.handlers, "drop") && drop.accepts(at.eventOptions.drop)
      )
      if (target === undefined) throw drop.noTarget(this.name("drop"), locator.description)
      return [{
        node: target,
        description: `the drop target at ${locator.description}`,
        event: "drop",
        payload: () => drop.payload
      }]
    })
  }
  override expect(locator: Locator.Locator): object {
    return this.expectation(locator, defaults.matchers)
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
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any>,
  props: Props | Effect.Effect<Props, never, RP>
): Effect.Effect<HtmlPlay<Model, Msg, Events>, Play.StepError, R | RP | TestHost.TestHost | Scope.Scope> =>
  internal.begin(HtmlPlayCursor, "HtmlPlay", make, component, props) as any
