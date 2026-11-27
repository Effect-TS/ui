/**
 * The Subscriptions to the page, as opposed to one element's events:
 * `onDocument` for a game's arrow keys or a press outside a popup,
 * `shortcuts` for a table of keyboard shortcuts, `onCustomEvent` for a
 * `CustomEvent` dispatched on the document, `onWindow` for the window's
 * focus, `onAnimationFrame` for animation, `onMediaQuery` for CSS media
 * queries, `onVisibility` for tab visibility, and `onConnectivity` for
 * network connectivity.
 *
 * Their sources are `GlobalEvents`, `AnimationFrames`, `MediaQueries`,
 * `Query.Visibility`, and `Query.Connectivity`, which `BrowserHost.layer`
 * provides. Nothing listens on the server. A test drives them with
 * `HtmlScene`, with `TestGlobalEvents`, `TestAnimationFrames` and
 * `TestMediaQueries` from `@effect/ui/html/testing`, or with
 * `TestHost.setVisible` and `TestHost.setOnline` (which `TestHost.layer()`
 * always provides, starting `true`).
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { handle } from "../internal/handler.ts"
import * as queryCore from "../internal/queryCore.ts"
import * as services from "../internal/services.ts"
import type * as Query from "../Query.ts"
import * as Subscription from "../Subscription.ts"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import * as HtmlKeyboard from "./HtmlKeyboard.ts"
import * as frames from "./internal/frames.ts"
import * as globalEvents from "./internal/globalEvents.ts"
import * as mediaQueries from "./internal/mediaQueries.ts"
import * as signals from "./internal/signals.ts"

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
    options: {
      readonly capture: boolean
      readonly custom?: boolean | undefined
    },
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
export const GlobalEvents: Context.Reference<GlobalEvents> =
  globalEvents.GlobalEvents

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
  const direct: NonNullable<services.Direct[typeof services.direct]> = (
    context,
    emit,
    fail,
    enter
  ) => {
    const source = Context.get(context, GlobalEvents)
    return {
      initial: Effect.void,
      close: source.listen(
        target,
        event,
        { capture, custom },
        (payload, preventDefault) =>
          enter((latest) => {
            try {
              globalEvents.run(
                globalEvents.listenerOf(latest) ?? declared,
                payload,
                preventDefault,
                emit
              )
            } catch (error) {
              fail(Cause.die(error))
            }
          })
      )
    }
  }
  return Object.assign(
    Subscription.make(
      `@effect/ui/html/${target}`,
      capture ? [event, "capture"] : [event],
      () => Stream.never
    ),
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
 * so the listener exists only while it's wanted. For a table of single-key
 * shortcuts, use {@link shortcuts}.
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
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Direction = Schema.Literals(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
 * const Message = UiSchema.TaggedEnum({ PressedArrow: { key: Direction } })
 *
 * const Snake = Html.component({
 *   name: "Snake",
 *   model: Schema.Struct({ running: Schema.Boolean, heading: Direction }),
 *   message: Message
 * }).make({
 *   init: () => ({ running: true, heading: "ArrowRight" as const }),
 *   update: { PressedArrow: ($, { key }) => $.evolve({ heading: key }) },
 *   view: (h, model) => h.p(model.heading),
 *   subscriptions: ({ model }) => [
 *     model.running && HtmlSubscription.onDocument(
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
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onDocument = <K extends keyof DocumentEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<DocumentEvents[K]>>,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Msg> =>
  listenFor("document", event, handler, options)

/**
 * A Subscription that listens for a table of single-key shortcuts on the
 * host's document: {@link onDocument} on `"keydown"` with the handler of
 * `HtmlKeyboard.shortcuts`.
 *
 * **When to use**
 *
 * Use when an instance's document shortcuts fit in a table. An instance has
 * one `keydown` listener per phase, so to combine a table with other keydown
 * logic, or to listen on `"keyup"`, call `HtmlKeyboard.shortcuts` inside
 * {@link onDocument} instead.
 *
 * **Details**
 *
 * `preventDefault` defaults to `true`, so the browser's default is cancelled
 * for a key a row matches and kept for every other key. The rows match as
 * `HtmlKeyboard.shortcuts` describes, and the key is that of
 * {@link onDocument}: `@effect/ui/html/document:"keydown"`.
 *
 * **Example** (Document shortcuts from a table)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ OpenedHelp: {}, ClosedHelp: {} })
 *
 * const Shortcuts = Html.component({
 *   name: "Shortcuts",
 *   model: Schema.Boolean,
 *   message: Message
 * }).make({
 *   init: () => false,
 *   update: { OpenedHelp: () => true, ClosedHelp: () => false },
 *   view: (h, open) => h.p(open ? "help open" : "help closed"),
 *   subscriptions: () => [
 *     HtmlSubscription.shortcuts([
 *       { key: "?", message: Message.OpenedHelp() },
 *       { key: "Escape", message: Message.ClosedHelp(), whileTyping: true }
 *     ])
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Shortcuts, {})
 *   s.fireDocument("keydown", { key: "?", editable: true }).expectIgnored()
 *     .fireDocument("keydown", { key: "?" }).expectDefaultPrevented().expect(Locator.text("help open")).toExist()
 *     .fireDocument("keydown", { key: "Escape", editable: true }).expect(Locator.text("help closed")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const shortcuts = <
  const Rows extends ReadonlyArray<HtmlKeyboard.Shortcut<unknown>>
>(
  table: Rows,
  options?: GlobalEventOptions | undefined
): Subscription.Subscription<Rows[number]["message"]> =>
  onDocument("keydown", HtmlKeyboard.shortcuts(table), {
    ...options,
    preventDefault: options?.preventDefault ?? true
  })

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
 * import { HtmlSubscription } from "@effect/ui/html"
 *
 * const Message = UiSchema.TaggedEnum({ FocusedWindow: {}, BlurredWindow: {} })
 *
 * const subscriptions = () => [
 *   HtmlSubscription.onWindow("focus", Message.FocusedWindow()),
 *   HtmlSubscription.onWindow("blur", Message.BlurredWindow())
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
): Subscription.Subscription<Msg> =>
  listenFor("window", event, handler, options)

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
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Received: { text: Schema.String } })
 *
 * const Banner = Html.component({
 *   name: "Banner",
 *   model: Schema.String,
 *   message: Message
 * }).make({
 *   init: () => "",
 *   update: { Received: (_, { text }) => text },
 *   view: (h, text) => h.p(text),
 *   subscriptions: () => [
 *     HtmlSubscription.onCustomEvent("app:notice", ({ detail }) =>
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
): Subscription.Subscription<Msg> =>
  listenFor("document", event, handler, options, true)

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
export const AnimationFrames: Context.Reference<AnimationFrames> =
  frames.AnimationFrames

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
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ TickedFrame: { delta: Schema.Number } })
 *
 * const Stopwatch = Html.component({
 *   name: "Stopwatch",
 *   model: Schema.Struct({ running: Schema.Boolean, elapsed: Schema.Number }),
 *   message: Message
 * }).make({
 *   init: () => ({ running: true, elapsed: 0 }),
 *   update: {
 *     // A tab that comes back from the background sends one long frame.
 *     TickedFrame: ($, { delta }) => $.evolve({ elapsed: $.model.elapsed + Math.min(delta, 100) })
 *   },
 *   view: (h, model) => h.p(`${Math.round(model.elapsed)} ms`),
 *   subscriptions: ({ model }) => [
 *     model.running && HtmlSubscription.onAnimationFrame((delta) => Message.TickedFrame({ delta }))
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
export const onAnimationFrame = <Msg>(
  handler: View.Handler<Msg, number>
): Subscription.Subscription<Msg> =>
  Object.assign(
    Subscription.make("@effect/ui/html/animationFrame", Stream.never),
    { [frames.frame]: handler, [services.direct]: attachFrames }
  )

type Direct = NonNullable<services.Direct[typeof services.direct]>

// Sends what the latest declaration's handler returns for `value`.
const sendLatest = <A>(
  emit: Parameters<Direct>[1],
  fail: Parameters<Direct>[2],
  enter: Parameters<Direct>[3],
  handlerOf: (latest: object) => View.Handler<unknown, A>
) =>
(value: A): void =>
  enter((latest) => {
    try {
      const message = handle(handlerOf(latest), value)
      if (message !== undefined) emit(message, noop)
    } catch (error) {
      fail(Cause.die(error))
    }
  })

const attachFrames: Direct = (context, emit, fail, enter) => {
  const source = Context.get(context, AnimationFrames)
  const send = sendLatest(emit, fail, enter, frames.handlerOf)
  let last = source.now()
  return {
    initial: Effect.void,
    close: source.listen((time) => {
      const delta = Math.max(0, time - last)
      last = time
      send(delta)
    })
  }
}

const noop = () => {}

/**
 * Supplies the current match and change notifications for `onMediaQuery`.
 *
 * **Details**
 *
 * `matches` returns whether `query` currently matches, or `undefined` when no
 * source is available so `onMediaQuery` sends nothing on start. `listen` calls
 * the listener on each `change` with the new `matches` value, until the
 * function it returns is called.
 *
 * `BrowserHost.layer` provides one over its document's `defaultView.matchMedia`.
 * The default returns `undefined` and never notifies listeners. In tests, use
 * `HtmlScene.mediaQuery` or `TestMediaQueries` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface MediaQueries {
  readonly matches: (query: string) => boolean | undefined
  readonly listen: (
    query: string,
    listener: (matches: boolean) => void
  ) => () => void
}

/**
 * The source of CSS media query matches. It defaults to one that never fires
 * and sends nothing.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const MediaQueries: Context.Reference<MediaQueries> =
  mediaQueries.MediaQueries

const attachValue = (
  initial: boolean | undefined,
  listen: (listener: (value: boolean) => void) => () => void,
  send: (value: boolean) => void
) => {
  // Deliver the captured value before changes, even if they arrive before
  // the `initial` effect runs. Queue changes triggered by handlers to
  // preserve delivery order.
  const queue: Array<boolean> = initial === undefined ? [] : [initial]
  let draining = false
  const drain = () => {
    if (draining) return
    draining = true
    try {
      for (const value of queue) send(value)
    } finally {
      queue.length = 0
      draining = false
    }
  }
  return {
    initial: Effect.sync(drain),
    close: listen((value) => {
      queue.push(value)
      drain()
    })
  }
}

/**
 * A Subscription that tracks a CSS media query: it sends the current `matches`
 * value when it starts, then each `change`.
 *
 * **When to use**
 *
 * Use to react to viewport breakpoints, color-scheme preferences, or
 * reduced-motion settings in component state.
 *
 * **Details**
 *
 * `handler` is a message or a function of `matches: boolean`. The source is
 * `MediaQueries`, which `BrowserHost.layer` provides over
 * `defaultView.matchMedia`. The server never runs Subscriptions, so `init`
 * chooses the initial state. The first browser emission updates that state.
 *
 * The key is `@effect/ui/html/mediaQuery` with `query` as its dep, e.g.
 * `@effect/ui/html/mediaQuery:"(prefers-color-scheme: dark)"`, so different
 * queries run side by side.
 *
 * **Example** (Following the user's color scheme)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedScheme: { dark: Schema.Boolean } })
 *
 * const Theme = Html.component({
 *   name: "Theme",
 *   model: Schema.Boolean,
 *   message: Message
 * }).make({
 *   init: () => false,
 *   update: { ChangedScheme: (_, { dark }) => dark },
 *   view: (h, dark) => h.p(dark ? "dark" : "light"),
 *   subscriptions: () => [
 *     HtmlSubscription.onMediaQuery(
 *       "(prefers-color-scheme: dark)",
 *       (dark) => Message.ChangedScheme({ dark })
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Theme, {})
 *   s.mediaQuery("(prefers-color-scheme: dark)", true)
 *     .expect(Locator.text("dark")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onMediaQuery = <Msg>(
  query: string,
  handler: View.Handler<Msg, boolean>
): Subscription.Subscription<Msg> => {
  const declared: mediaQueries.Listener = { query, handler }
  const direct: Direct = (context, emit, fail, enter) => {
    const source = Context.get(context, MediaQueries)
    return attachValue(
      source.matches(query),
      (listener) => source.listen(query, listener),
      sendLatest(
        emit,
        fail,
        enter,
        (latest) => (mediaQueries.listenerOf(latest) ?? declared).handler
      )
    )
  }
  return Object.assign(
    Subscription.make("@effect/ui/html/mediaQuery", query, () => Stream.never),
    { [mediaQueries.mediaQuery]: declared, [services.direct]: direct }
  )
}

const makeAttachSignal = (
  reference: Context.Reference<Query.Signal>,
  handlerOf: (
    subscription: object
  ) => View.Handler<unknown, boolean> | undefined
): Direct =>
(context, emit, fail, enter) => {
  const source = Context.get(context, reference)
  return attachValue(
    source.get(),
    (listener) => source.subscribe(listener),
    sendLatest(emit, fail, enter, handlerOf)
  )
}

const attachVisibility = makeAttachSignal(
  queryCore.Visibility,
  signals.visibilityHandlerOf
)

const attachConnectivity = makeAttachSignal(
  queryCore.Connectivity,
  signals.connectivityHandlerOf
)

/**
 * A Subscription that tracks whether the tab is visible: it sends the current
 * `visible` value when it starts, then each change.
 *
 * **When to use**
 *
 * Use to pause timers, media playback, or animations while the tab is hidden,
 * or to react when the user returns to the tab.
 *
 * **Details**
 *
 * `handler` is a message or a function of `visible: boolean`. The source is
 * `Query.Visibility`, which `BrowserHost.layer` provides from
 * `document.visibilityState` and `visibilitychange`. The server never runs
 * Subscriptions, so `init` chooses the initial state and the first browser
 * emission updates it after hydration. Without a host, `Query.Visibility`
 * defaults to always `true`, so it emits `true` once.
 *
 * In tests, `HtmlScene.visibility` drives the handler directly, and
 * `TestHost.setVisible` drives the shared signal on `TestHost` and `Play`
 * (starting `true`).
 *
 * The key is `@effect/ui/html/visibility`, and an instance has one.
 *
 * **Example** (Pausing while the tab is hidden)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedVisibility: { visible: Schema.Boolean } })
 *
 * const Player = Html.component({
 *   name: "Player",
 *   model: Schema.Boolean,
 *   message: Message
 * }).make({
 *   init: () => true,
 *   update: { ChangedVisibility: (_, { visible }) => visible },
 *   view: (h, visible) => h.p(visible ? "playing" : "paused"),
 *   subscriptions: () => [
 *     HtmlSubscription.onVisibility((visible) => Message.ChangedVisibility({ visible }))
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Player, {})
 *   s.visibility(false)
 *     .expect(Locator.text("paused")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onVisibility = <Msg>(
  handler: View.Handler<Msg, boolean>
): Subscription.Subscription<Msg> =>
  Object.assign(
    Subscription.make("@effect/ui/html/visibility", Stream.never),
    { [signals.visibility]: handler, [services.direct]: attachVisibility }
  )

/**
 * A Subscription that tracks whether the browser is online: it sends the
 * current `online` value when it starts, then each change.
 *
 * **When to use**
 *
 * Use to show an offline banner, disable actions that require a network
 * connection, or trigger UI state changes when connectivity returns.
 *
 * **Details**
 *
 * `handler` is a message or a function of `online: boolean`. The source is
 * `Query.Connectivity`, which `BrowserHost.layer` provides from
 * `defaultView.navigator.onLine` and the window's `online` and `offline`
 * events. The server never runs Subscriptions, so `init` chooses the initial
 * state and the first browser emission updates it after hydration. Without a
 * host, `Query.Connectivity` defaults to always `true`, so it emits `true`
 * once.
 *
 * In tests, `HtmlScene.connectivity` drives the handler directly, and
 * `TestHost.setOnline` drives the shared signal on `TestHost` and `Play`
 * (starting `true`).
 *
 * The key is `@effect/ui/html/connectivity`, and an instance has one.
 *
 * **Example** (Showing an offline banner)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedConnectivity: { online: Schema.Boolean } })
 *
 * const Banner = Html.component({
 *   name: "Banner",
 *   model: Schema.Boolean,
 *   message: Message
 * }).make({
 *   init: () => true,
 *   update: { ChangedConnectivity: (_, { online }) => online },
 *   view: (h, online) => h.p(online ? "online" : "offline"),
 *   subscriptions: () => [
 *     HtmlSubscription.onConnectivity((online) => Message.ChangedConnectivity({ online }))
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Banner, {})
 *   s.connectivity(false)
 *     .expect(Locator.text("offline")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onConnectivity = <Msg>(
  handler: View.Handler<Msg, boolean>
): Subscription.Subscription<Msg> =>
  Object.assign(
    Subscription.make("@effect/ui/html/connectivity", Stream.never),
    { [signals.connectivity]: handler, [services.direct]: attachConnectivity }
  )
