/**
 * Subscriptions to the host's document and window: `onDocument` for a
 * keyboard shortcut or a press outside a popup, and `onWindow` for the
 * window's focus.
 *
 * Their source is the `GlobalEvents` service, which `BrowserHost.layer`
 * provides. Nothing listens on the server, and a test fires events with
 * `HtmlScene` or `TestGlobalEvents` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as services from "../internal/services.ts"
import * as Subscription from "../Subscription.ts"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import * as globalEvents from "./internal/globalEvents.ts"

/**
 * The events `onDocument` listens for, with their payloads: the same ones
 * an element's handler gets.
 *
 * **Details**
 *
 * `pointerup` and `pointercancel` get the pointer payload. Together they
 * end every press, including one the browser cancels, such as a touch that
 * turns into a scroll, which sends no `mouseup`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface DocumentEvents {
  readonly keydown: Html.KeyPayload
  readonly keyup: Html.KeyPayload
  readonly mousedown: Html.PointerPayload
  readonly mouseup: Html.PointerPayload
  readonly click: Html.PointerPayload
  readonly pointerup: Html.PointerPayload
  readonly pointercancel: Html.PointerPayload
}

/**
 * The events `onWindow` listens for, with their payloads.
 *
 * **Details**
 *
 * `focus` and `blur` don't bubble, so a listener in the bubble phase hears
 * only the window's own: the window gaining and losing focus, not an element
 * in it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface WindowEvents {
  readonly focus: {}
  readonly blur: {}
}

/**
 * The payload of a document or window listener: the event's payload, and
 * whether something already cancelled the event's default.
 *
 * **Details**
 *
 * In the bubble phase `defaultPrevented` includes every element handler
 * set with `preventDefault`, since the host's own listeners run on the
 * document in the capture phase. In the capture phase it depends on the
 * order the listeners were added in, so don't read it there.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type GlobalPayload<P> = P & { readonly defaultPrevented: boolean }

/**
 * The options of `onDocument` and `onWindow`: `preventDefault`, as on an
 * element's handler, and `capture`, to listen in the capture phase, before
 * any element sees the event, so a handler that stops it can't hide it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface GlobalEventOptions extends View.EventOptions {
  readonly capture?: boolean | undefined
}

/**
 * The source of document and window events, which `onDocument` and
 * `onWindow` listen to.
 *
 * **Details**
 *
 * `listen` adds a listener to the host's `document` or its window and
 * returns the function that removes it. The listener gets the plain payload,
 * `defaultPrevented` included, and a function that cancels the event's
 * default.
 *
 * `BrowserHost.layer` provides the one over its `document` and that
 * document's `defaultView`, so an app in an iframe hears its own document.
 * The default never fires, so a host without a document, and a test that
 * doesn't fire events, need nothing. A test fires them with `HtmlScene`'s
 * `fireDocument` and `fireWindow`, or with `TestGlobalEvents` from
 * `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface GlobalEvents {
  readonly listen: (
    target: "document" | "window",
    event: string,
    options: { readonly capture: boolean },
    listener: (payload: unknown, preventDefault: () => void) => void
  ) => () => void
}

/**
 * The source of document and window events. It defaults to one that never
 * fires.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const GlobalEvents: Context.Reference<GlobalEvents> = Context.Reference<GlobalEvents>(
  "@effect/ui/html/DomSubscription/GlobalEvents",
  { defaultValue: () => silent }
)

const silent: GlobalEvents = { listen: () => () => {} }

const listenFor = (
  target: "document" | "window",
  event: string,
  handler: View.Handler<unknown, any>,
  options: GlobalEventOptions | undefined
): Subscription.Subscription<any> => {
  const capture = options?.capture === true
  const declared: globalEvents.Listener = {
    target,
    event,
    capture,
    handler,
    preventDefault: options?.preventDefault
  }
  // The runtime attaches the listener here and runs no Stream, as for `Router.prefetch`. `enter`
  // renders the pending ancestors first, so an event goes to the latest declaration, or nowhere if
  // they removed it.
  const direct: NonNullable<services.Direct[typeof services.direct]> = (context, emit, fail, enter) => ({
    initial: Effect.void,
    close: Context.get(context, GlobalEvents).listen(
      target,
      event,
      { capture },
      (payload, preventDefault) =>
        enter((latest) => {
          try {
            globalEvents.run(globalEvents.listenerOf(latest) ?? declared, payload, preventDefault, emit)
          } catch (error) {
            fail(Cause.die(error))
          }
        })
    )
  })
  return Object.assign(
    Subscription.make(`@effect/ui/html/${target}`, capture ? [event, "capture"] : [event], () => Stream.never),
    { [globalEvents.listener]: declared, [services.direct]: direct }
  )
}

/**
 * A Subscription that listens for an event on the host's document.
 *
 * **When to use**
 *
 * Use when the input is one no element of the component hears: a keyboard shortcut, a
 * game's arrow keys, a press outside a popup. Gate the entry on the Model,
 * so the listener exists only while it's wanted.
 *
 * **Details**
 *
 * `handler` is a message or a function of the payload, as on an element,
 * and the payload is plain data with `defaultPrevented` added. With
 * `preventDefault: true` the default is cancelled only when the handler
 * returns a message, and with `"always"` whatever it returns. `capture:
 * true` listens in the capture phase.
 *
 * The listener calls the handler of the latest `subscriptions` result, so a
 * handler that reads the Model sees the current one. The source is
 * `GlobalEvents`, which `BrowserHost.layer` provides, so nothing listens on
 * the server and a test fires the event without a document.
 *
 * The key is `@effect/ui/html/document` with the event as its dep, and
 * `"capture"` after it for a capture listener:
 * `@effect/ui/html/document:"keydown"`. An instance has one listener per
 * event and phase. Listing a second fails the instance as a duplicate key,
 * so put both cases in one handler.
 *
 * **Example** (Steering with the arrow keys while the game runs)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { DomSubscription, Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Direction = Schema.Literals(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
 * const Message = UiSchema.TaggedEnum({ PressedArrow: { key: Direction } })
 *
 * const Snake = Component.define({
 *   name: "Snake",
 *   scoped: false,
 *   model: Schema.Struct({ running: Schema.Boolean, heading: Direction }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ running: true, heading: "ArrowRight" as const }),
 *   update: { PressedArrow: (_model, { key }, $) => $.evolve({ heading: key }) },
 *   view: (model, h) => h.p(model.heading),
 *   subscriptions: (model) => [
 *     model.running && DomSubscription.onDocument(
 *       "keydown",
 *       // The page doesn't scroll on an arrow key, and other keys keep their default.
 *       ({ key }) => Schema.is(Direction)(key) ? Message.PressedArrow({ key }) : undefined,
 *       { preventDefault: true }
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Snake, {})
 *   s.fireDocument("keydown", { key: "ArrowUp" })
 *     .expectDefaultPrevented()
 *     .expect(Locator.text("ArrowUp")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * **Example** (Shortcuts from a table, ignored while typing unless a row says otherwise)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { DomSubscription, Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ OpenedHelp: {}, ClosedHelp: {} })
 *
 * const Shortcuts = Component.define({
 *   name: "Shortcuts",
 *   scoped: false,
 *   model: Schema.Boolean,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => false,
 *   update: { OpenedHelp: () => true, ClosedHelp: () => false },
 *   view: (open, h) => h.p(open ? "help open" : "help closed"),
 *   subscriptions: () => [
 *     DomSubscription.onDocument(
 *       "keydown",
 *       Html.shortcuts([
 *         { key: "?", message: Message.OpenedHelp() },
 *         { key: "Escape", message: Message.ClosedHelp(), whileTyping: true }
 *       ]),
 *       { preventDefault: true }
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Shortcuts, {})
 *   s.fireDocument("keydown", { key: "?", editable: true }).expectIgnored()
 *     .fireDocument("keydown", { key: "?" }).expect(Locator.text("help open")).toExist()
 *     .fireDocument("keydown", { key: "Escape", editable: true }).expect(Locator.text("help closed")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onDocument = <K extends keyof DocumentEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<DocumentEvents[K]>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("document", event, handler, options)

/**
 * A Subscription that listens for an event on the host's window.
 *
 * **Details**
 *
 * It works as `onDocument` does, with the key `@effect/ui/html/window`.
 * Its events are the window's `focus` and `blur`, such as to pause a timer
 * while the user is in another window.
 *
 * **Example** (Following the window's focus)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { DomSubscription } from "@effect/ui/html"
 *
 * const Message = UiSchema.TaggedEnum({ FocusedWindow: {}, BlurredWindow: {} })
 *
 * const subscriptions = () => [
 *   DomSubscription.onWindow("focus", Message.FocusedWindow()),
 *   DomSubscription.onWindow("blur", Message.BlurredWindow())
 * ]
 *
 * subscriptions().map((subscription) => subscription.key) // => ['@effect/ui/html/window:"focus"', '@effect/ui/html/window:"blur"']
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onWindow = <K extends keyof WindowEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<WindowEvents[K]>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("window", event, handler, options)
