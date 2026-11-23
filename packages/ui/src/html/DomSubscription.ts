/**
 * Subscriptions to the host's document and window: `onDocument` for a
 * keyboard shortcut or a press outside a popup, `onCustomEvent` for a
 * `CustomEvent` dispatched on the document, `onWindow` for the window's
 * focus, and `onAnimationFrame` for animation.
 *
 * Their sources are the `GlobalEvents` and `AnimationFrames` services,
 * which `BrowserHost.layer` provides. Nothing listens on the server, and a
 * test fires events and frames with `HtmlScene`, or with
 * `TestGlobalEvents` and `TestAnimationFrames` from
 * `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { handle } from "../internal/handler.ts"
import * as services from "../internal/services.ts"
import * as Subscription from "../Subscription.ts"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import * as frames from "./internal/frames.ts"
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
 * The payload of `onCustomEvent`: the event's `detail`, which is `null`
 * when the event has none.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface CustomEventPayload {
  readonly detail: unknown
}

/**
 * The options of `onDocument`, `onCustomEvent` and `onWindow`:
 * `preventDefault`, as on an element's handler, and `capture`, to listen in
 * the capture phase, before any element sees the event, so a handler that
 * stops it can't hide it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface GlobalEventOptions extends View.EventOptions {
  readonly capture?: boolean | undefined
}

/**
 * The source of document and window events, which `onDocument`,
 * `onCustomEvent` and `onWindow` listen to.
 *
 * **Details**
 *
 * `listen` adds a listener to the host's `document` or its window and
 * returns the function that removes it. The listener gets the plain payload,
 * `defaultPrevented` included, and a function that cancels the event's
 * default. With `custom: true` the payload is a `CustomEventPayload`,
 * whatever the event's type.
 *
 * `BrowserHost.layer` provides the one over its `document` and that
 * document's `defaultView`, so an app in an iframe hears its own document.
 * The default never fires, so a host without a document, and a test that
 * doesn't fire events, need nothing. A test fires them with `HtmlScene`'s
 * `fireDocument`, `fireCustomEvent` and `fireWindow`, or with
 * `TestGlobalEvents` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface GlobalEvents {
  readonly listen: (
    target: "document" | "window",
    event: string,
    options: { readonly capture: boolean; readonly custom?: boolean | undefined },
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
  options: GlobalEventOptions | undefined,
  custom = false
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
      { capture, custom },
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
 * import { DomSubscription, Html, HtmlKeyboard } from "@effect/ui/html"
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
 *   update: { PressedArrow: ($, { key }) => $.evolve({ heading: key }) },
 *   view: (h, model) => h.p(model.heading),
 *   subscriptions: ({ model }) => [
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
 * import { DomSubscription, Html, HtmlKeyboard } from "@effect/ui/html"
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
 *   view: (h, open) => h.p(open ? "help open" : "help closed"),
 *   subscriptions: () => [
 *     DomSubscription.onDocument(
 *       "keydown",
 *       HtmlKeyboard.shortcuts([
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

/**
 * A Subscription that listens for a `CustomEvent` on the host's document.
 *
 * **Details**
 *
 * It works as `onDocument` does, with the key `@effect/ui/html/document`, for
 * an event type outside `DocumentEvents`. The payload carries the event's
 * `detail` (as `unknown`) and `defaultPrevented`. A test fires it with
 * `HtmlScene`'s `fireCustomEvent` or `TestGlobalEvents.fireCustomEvent`.
 *
 * **Example** (Listening for a custom document event)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { DomSubscription, Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Received: { text: Schema.String } })
 *
 * const Banner = Component.define({
 *   name: "Banner",
 *   scoped: false,
 *   model: Schema.String,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => "",
 *   update: { Received: (_, { text }) => text },
 *   view: (h, text) => h.p(text),
 *   subscriptions: () => [
 *     DomSubscription.onCustomEvent("app:notice", ({ detail }) =>
 *       typeof detail === "string" ? Message.Received({ text: detail }) : undefined
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Banner, {})
 *   s.fireCustomEvent("app:notice", { detail: "saved" })
 *     .expect(Locator.text("saved")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onCustomEvent = <Msg>(
  event: string,
  handler: View.Handler<Msg, GlobalPayload<CustomEventPayload>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("document", event, handler, options, true)

/**
 * The source of animation frames, which `onAnimationFrame` listens to.
 *
 * **Details**
 *
 * `listen` calls the listener once per frame with the frame's time in ms,
 * until the function it returns is called. `now` is the current time on
 * the same clock.
 *
 * `BrowserHost.layer` provides the one over its document's window, with
 * `requestAnimationFrame` and `performance.now`. The default never fires,
 * so a host without a window, and a test that doesn't fire frames, need
 * nothing. A test fires them with `HtmlScene`'s `frame`, or with
 * `TestAnimationFrames` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface AnimationFrames {
  readonly now: () => number
  readonly listen: (listener: (time: number) => void) => () => void
}

/**
 * The source of animation frames. It defaults to one that never fires.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const AnimationFrames: Context.Reference<AnimationFrames> = Context.Reference<AnimationFrames>(
  "@effect/ui/html/DomSubscription/AnimationFrames",
  { defaultValue: () => still }
)

const still: AnimationFrames = { now: () => 0, listen: () => () => {} }

/**
 * A Subscription that sends a message on every animation frame, with the
 * time since the last one in ms.
 *
 * **When to use**
 *
 * Use to move a scene along with the screen's refresh, such as a game or a
 * simulation drawn with `Canvas`. Gate the entry on the Model, so frames
 * come only while it runs.
 *
 * **Details**
 *
 * `handler` is a message or a function of the delta. The source is
 * `AnimationFrames`, and the runtime dispatches each frame's message as it
 * fires, so the update, the render and a `Canvas` repaint all land in the
 * frame that ticked.
 *
 * The first delta counts from when the Subscription starts, so a pause and
 * resume doesn't jump. A browser stops sending frames to a hidden tab,
 * though, and the first one after it returns covers the whole time away.
 * Cap the delta in `update` when it drives motion.
 *
 * The key is `@effect/ui/html/animationFrame`, and an instance has one.
 *
 * **Example** (A clock that runs while the Model says so)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { DomSubscription, Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ TickedFrame: { delta: Schema.Number } })
 *
 * const Stopwatch = Component.define({
 *   name: "Stopwatch",
 *   scoped: false,
 *   model: Schema.Struct({ running: Schema.Boolean, elapsed: Schema.Number }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ running: true, elapsed: 0 }),
 *   update: {
 *     // A tab that comes back from the background sends one long frame.
 *     TickedFrame: (model, { delta }, $) => $.evolve({ elapsed: model.elapsed + Math.min(delta, 100) })
 *   },
 *   view: (model, h) => h.p(`${Math.round(model.elapsed)} ms`),
 *   subscriptions: (model) => [
 *     model.running && DomSubscription.onAnimationFrame((delta) => Message.TickedFrame({ delta }))
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Stopwatch, {})
 *   s.frame(16).frame(5000)
 *     .expect(Locator.text("116 ms")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onAnimationFrame = <Msg>(handler: View.Handler<Msg, number>): Subscription.Subscription<Msg> =>
  Object.assign(
    Subscription.make("@effect/ui/html/animationFrame", Stream.never),
    { [frames.frame]: handler, [services.direct]: attachFrames }
  )

const attachFrames: NonNullable<services.Direct[typeof services.direct]> = (context, emit, fail, enter) => {
  const source = Context.get(context, AnimationFrames)
  let last = source.now()
  return {
    initial: Effect.void,
    close: source.listen((time) => {
      const delta = Math.max(0, time - last)
      last = time
      enter((latest) => {
        try {
          const message = handle(frames.handlerOf(latest), delta)
          if (message !== undefined) emit(message, noop)
        } catch (error) {
          fail(Cause.die(error))
        }
      })
    })
  }
}

const noop = () => {}
