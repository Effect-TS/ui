/**
 * `Play` with the HTML vocabulary: steps that send what the browser host
 * sends for each user action, and assertions on fields.
 *
 * `HtmlPlay.HtmlPlay` extends `Play.Play`, so every Play step works here.
 * Each step is the `HtmlScene` step of the same name, sent to the tree on
 * `TestHost`. `click` sends `pointerdown`, `mousedown`, `mouseup` and `click`,
 * then runs the browser's defaults as `HtmlScene.click` does: it throws on a
 * disabled control, a submit button submits its form with the fields read from
 * the tree, a checkbox or radio button fires `input` and `change`, and a
 * `popovertarget` button toggles its popover.
 *
 * Some things differ from a Scene, as they do in a browser. `type` and
 * `change` write the field's `value`, and a click on a checkbox or radio
 * button its `checked`, unchecking the rest of a radio group, before the
 * event, so an uncontrolled field keeps what the user entered. A controlled
 * field goes back to what the view set once the step settles, unless the
 * Model took the edit. A `popovertarget` click opens or closes the popover,
 * so the next click sees it. `click` settles between the press (`pointerdown`,
 * `mousedown`) and the release (`mouseup`, `click`, defaults), while the
 * release events run with no render between them, so a submit reads the fields
 * as they were before the click's own message. And `focus`, `blur` and the
 * browser's other events that don't bubble go to the matched element only.
 *
 * **Example** (Signing in)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
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
 * const SignIn = Html.component({
 *   name: "SignIn",
 *   model: Schema.Struct({ email: Schema.String, signedIn: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ email: "", signedIn: false }),
 *   update: ($, message) =>
 *     Message.match(message, {
 *       ChangedEmail: ({ value }) => $.evolve({ email: value }),
 *       SubmittedForm: () => $.evolve({ signedIn: true })
 *     }),
 *   view: (h, model) =>
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
import * as Effect from "effect/Effect"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as Component from "../../Component.ts"
import * as controlled from "../../internal/controlled.ts"
import * as internal from "../../internal/play.ts"
import * as scene from "../../internal/scene.ts"
import { atSite, callSite } from "../../internal/steps.ts"
import * as Renderer from "../../Renderer.ts"
import * as Locator from "../../testing/Locator.ts"
import type * as Play from "../../testing/Play.ts"
import * as TestHost from "../../testing/TestHost.ts"
import type * as View from "../../View.ts"
import type * as Html from "../Html.ts"
import * as HtmlSubscription from "../HtmlSubscription.ts"
import * as defaults from "../internal/defaults.ts"
import { isCustomTag } from "../internal/elements.ts"
import * as globalEvents from "../internal/globalEvents.ts"
import { ownEvents } from "../internal/ownEvents.ts"
import type * as HtmlScene from "./HtmlScene.ts"
import * as TestGlobalEvents from "./TestGlobalEvents.ts"

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
type DocumentKeyDetails = Partial<
  Omit<HtmlSubscription.GlobalPayload<Html.KeyPayload>, "key">
>

/**
 * A cursor over an HTML tree on `TestHost`: the Play's steps, plus a step
 * per user action the browser host turns into an event. Each one is an
 * interaction.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HtmlPlay<Model, Msg, Events>
  extends Play.Play<Model, Msg, Events>
{
  /**
   * Clicks the one element `target` matches, as a browser does: `pointerdown`
   * and `mousedown` run, the tree settles, then `mouseup`, `click` and the
   * defaults run unless the press removed or disabled the element. Cancelling
   * `pointerdown` skips `mousedown` and `mouseup` (not `click`); cancelling
   * `mousedown` or `mouseup` skips nothing; only a cancelled `click` skips the
   * defaults. A string means `Locator.text(target)`. Throws on a disabled
   * control, and when nothing handles any event of the click.
   */
  click(target: string | Locator.Locator): Effect.Effect<void, Play.StepError>
  /**
   * Sets a field's value as typing does: writes `value` to the field, then
   * sends `input` with it. An `input` also sends its current `checked`.
   */
  type(
    locator: Locator.Locator,
    value: string
  ): Effect.Effect<void, Play.StepError>
  /**
   * Sends `change`, as a field does once its edit is committed. A string is
   * the new value; an object also sets `checked` on an `input`, and `files`
   * on a file input. `change(locator, { files })` chooses files in a file
   * input.
   */
  change(
    locator: Locator.Locator,
    value: string | Partial<Html.InputPayload>
  ): Effect.Effect<void, Play.StepError>
  /**
   * Presses `key`: sends `keydown` with the modifier keys, `composing`,
   * `repeat` and selection given, each `false` or `null` otherwise. `editable`
   * defaults from the matched element unless given.
   */
  keydown(
    locator: Locator.Locator,
    key: string,
    details?: KeyDetails
  ): Effect.Effect<void, Play.StepError>
  /**
   * Presses `key` on the document: delivers `keydown` to the tree's document
   * listeners and settles the resulting UI work without advancing `TestClock`.
   * Missing payload fields default as for an element keydown with `editable`
   * and `defaultPrevented` false.
   */
  keydown(
    target: "document",
    key: string,
    details?: DocumentKeyDetails
  ): Effect.Effect<void, Play.StepError>
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
  drop(
    locator: Locator.Locator,
    payload?: Partial<Html.DropPayload>
  ): Effect.Effect<void, Play.StepError>
  /**
   * Sends an event `element` declares, from the element `locator` matches,
   * with `detail` as the element would send it, to the innermost element
   * with a handler for it, as `HtmlScene.fireElement` does. Throws when
   * nothing handles `event` there or above.
   */
  fireElement<
    E extends { readonly [event: string]: Schema.Decoder<unknown> },
    K extends keyof E & string
  >(
    element: Html.CustomElementBinding<any, any, E>,
    locator: Locator.Locator,
    event: K,
    detail: E[K]["Encoded"]
  ): Effect.Effect<void, Play.StepError>

  /** Asserts on the elements `locator` matches, once the tree has settled. */
  expect(locator: Locator.Locator): Expect
}

class HtmlPlayCursor extends internal.PlayCursor {
  /** `make` sets it once the tree is mounted. */
  documentKeys!: DocumentKeys
  protected override bubbles(event: string): boolean {
    return !ownEvents.has(event)
  }
  override click(
    target: string | Locator.Locator
  ): Effect.Effect<void, Play.StepError> {
    const locator = typeof target === "string" ? Locator.text(target) : target
    const site = callSite(this.click)
    const name = this.name("click")
    return Effect.gen({ self: this }, function*() {
      let reached = false
      let handled = false
      const send = (
        node: TestHost.TestElement,
        event: string,
        payload: () => unknown = () => scene.pointer
      ): boolean => {
        const fired = this.dispatchEvent(node, event, payload)
        if (fired === undefined) return false
        reached = true
        handled ||= fired.handled
        return fired.prevented
      }
      yield* this.settle
      const [node, skipMouse] = yield* Effect.sync(() =>
        atSite(site, () => {
          this.checkReady(name)
          const node = this.findOne(locator, "click")
          if (defaults.isClickDisabled(internal.ancestors(node))) {
            throw new Error(`${name}: ${locator.description} is disabled`)
          }
          const skipMouse = send(node, "pointerdown")
          if (!skipMouse) send(node, "mousedown")
          return [node, skipMouse] as const
        })
      )
      if (handled) yield* this.settle
      const edited = yield* Effect.sync(() =>
        atSite(site, () => {
          const edited: Array<TestHost.TestElement> = []
          const container = this.root.container
          const path = internal.ancestors(node)
          if (path.includes(container) && !defaults.isClickDisabled(path)) {
            const plan = defaults.planClickDefaults(
              container,
              node,
              path,
              locator.description
            )
            if (!skipMouse) send(node, "mouseup")
            if (!send(node, "click")) {
              for (const { checks, event, node, payload } of plan) {
                const element = node as TestHost.TestElement
                const sent = () => payload(container, (node) => node)
                if (checks !== undefined) {
                  for (const [other, checked] of checks()) {
                    const control = other as TestHost.TestElement
                    control.props.checked = checked
                    edited.push(control)
                  }
                } else if (event === "toggle") {
                  element.props.popoverOpen =
                    (sent() as Html.PopoverTogglePayload).open
                  edited.push(element)
                }
                send(element, event, sent)
              }
            }
          }
          if (!reached) {
            throw new Error(
              `${name}: nothing handles "click" at ${locator.description}`
            )
          }
          this.recordInteraction("click", handled)
          return edited
        })
      )
      yield* this.settle
      this.restoreControlled(edited)
    })
  }
  type(
    locator: Locator.Locator,
    value: string
  ): Effect.Effect<void, Play.StepError> {
    return this.one(
      "type",
      locator,
      "input",
      (node) => defaults.inputPayload(node, value),
      (node) => {
        node.props.value = value
      }
    )
  }
  change(
    locator: Locator.Locator,
    value: string | Partial<Html.InputPayload>
  ): Effect.Effect<void, Play.StepError> {
    return this.one(
      "change",
      locator,
      "change",
      (node) => defaults.changePayload(node, value),
      (node, payload) => {
        node.props.value = payload.value
        if ("checked" in payload) node.props.checked = payload.checked
      }
    )
  }
  keydown(
    target: "document" | Locator.Locator,
    key: string,
    details?: DocumentKeyDetails
  ): Effect.Effect<void, Play.StepError> {
    if (target === "document") {
      const site = callSite(this.keydown)
      const name = this.name("keydown")
      return Effect.gen({ self: this }, function*() {
        yield* this.settle
        yield* Effect.sync(() =>
          atSite(site, () => {
            this.checkReady(name)
            const handled = this.documentKeys.down({ ...details, key })
            if (handled === undefined) {
              throw new Error(
                `${name}: nothing listens for "keydown" on the document`
              )
            }
            this.recordInteraction("keydown", handled)
          })
        )
        yield* this.settle
      })
    }
    return this.one(
      "keydown",
      target,
      "keydown",
      (node) => defaults.keyPayload(key, details, internal.ancestors(node))
    )
  }
  submit(locator: Locator.Locator): Effect.Effect<void, Play.StepError> {
    return this.interact("submit", () => {
      const node = this.findOne(locator, "submit")
      const container = this.root.container
      const form = defaults.formOf(internal.ancestors(node), container) as
        | TestHost.TestElement
        | undefined
      if (form === undefined) {
        throw new Error(
          `${this.name("submit")}: ${locator.description} isn't in a form`
        )
      }
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
  fireElement(
    _element: unknown,
    locator: Locator.Locator,
    event: string,
    detail: unknown
  ): Effect.Effect<void, Play.StepError> {
    return this.one("fireElement", locator, event, () => ({ detail }))
  }
  drop(
    locator: Locator.Locator,
    payload?: Partial<Html.DropPayload>
  ): Effect.Effect<void, Play.StepError> {
    const drop = defaults.drop(payload)
    return this.interact("drop", () => {
      const target = internal.ancestors(this.findOne(locator, "drop")).find((
        at
      ) =>
        Object.hasOwn(at.handlers, "drop") && drop.accepts(at.eventOptions.drop)
      )
      if (target === undefined) {
        throw drop.noTarget(this.name("drop"), locator.description)
      }
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

interface DocumentKeys {
  readonly source: HtmlSubscription.GlobalEvents
  /**
   * Fires `keydown` at the document listeners added through `source`.
   * Returns whether one produced a message, or `undefined` when none heard it.
   */
  readonly down: (
    payload: Partial<HtmlSubscription.GlobalPayload<Html.KeyPayload>>
  ) => boolean | undefined
}

// A listener is added to `upstream` too, so the events a test fires there still arrive.
const documentKeys = (
  upstream: HtmlSubscription.GlobalEvents
): DocumentKeys => {
  const own = TestGlobalEvents.make()
  let heard = false
  return {
    source: {
      listen: (target, event, options, listener) => {
        const offUpstream = upstream.listen(target, event, options, listener)
        const offOwn = own.listen(target, event, options, (...args) => {
          heard = true
          listener(...args)
        })
        return () => {
          offOwn()
          offUpstream()
        }
      }
    },
    down: (payload) => {
      heard = false
      const handled = globalEvents.emits(() => {
        own.fire("document", "keydown", payload)
      })
      return heard ? handled : undefined
    }
  }
}

const htmlHost = (
  base: Renderer.Host<TestHost.TestNode>
): Renderer.Host<TestHost.TestNode> => {
  const plain = new WeakMap<TestHost.TestElement, Map<string, unknown>>()
  return {
    ...base,
    setProp(node, name, value) {
      const element = node as TestHost.TestElement
      if (
        base.controlled.has(name) && name !== "popoverOpen" &&
        isCustomTag(element.tag)
      ) {
        let values = plain.get(element)
        if (values === undefined) plain.set(element, values = new Map())
        if (values.has(name) && values.get(name) === value) return
        values.set(name, value)
        base.setProp(node, name, value)
        controlled.want(element, name, undefined)
        return
      }
      base.setProp(node, name, value)
    }
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
): Effect.Effect<
  HtmlPlay<Model, Msg, Events>,
  Play.StepError,
  R | RP | TestHost.TestHost | Scope.Scope
> => {
  const started = internal.begin(
    HtmlPlayCursor,
    "HtmlPlay",
    make,
    component,
    props
  )
  return Effect.gen(function*() {
    const { host } = yield* TestHost.TestHost
    const keys = documentKeys(yield* HtmlSubscription.GlobalEvents)
    const play = yield* started.pipe(
      Effect.provideService(Renderer.Renderer, { host: htmlHost(host) }),
      Effect.provideService(HtmlSubscription.GlobalEvents, keys.source)
    )
    play.documentKeys = keys
    return play
  }) as any
}
