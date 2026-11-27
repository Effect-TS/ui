/**
 * The Subscriptions to the page, as opposed to one element's events:
 * `onDocument` for a game's arrow keys or a press outside a popup,
 * `shortcuts` for a table of keyboard shortcuts, `keySequences` for one with
 * multi-key rows such as `g` then `l`, `onCustomEvent` for a
 * `CustomEvent` dispatched on the document, `onWindow` for the window's
 * focus, `onAnimationFrame` for animation, and `onMediaQuery` for CSS media
 * queries.
 *
 * Their sources are the `GlobalEvents`, `AnimationFrames` and `MediaQueries`
 * services, which `BrowserHost.layer` provides. Nothing listens on the server,
 * and a test drives them with `HtmlScene`, or with `TestGlobalEvents`,
 * `TestAnimationFrames` and `TestMediaQueries` from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import { checkSequences } from "#dev"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { handle } from "../internal/handler.ts"
import * as services from "../internal/services.ts"
import * as Subscription from "../Subscription.ts"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import * as HtmlKeyboard from "./HtmlKeyboard.ts"
import * as frames from "./internal/frames.ts"
import * as globalEvents from "./internal/globalEvents.ts"
import * as keys from "./internal/keys.ts"
import * as mediaQueries from "./internal/mediaQueries.ts"

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
 * The payload of a document or window listener: the event's payload,
 * whether something already cancelled the event's default, and the event's
 * `timeStamp` in ms.
 *
 * **Details**
 *
 * In the bubble phase `defaultPrevented` includes every element handler
 * set with `preventDefault`, since the host's own listeners run on the
 * document in the capture phase. In the capture phase it depends on the
 * order the listeners were added in, so don't read it there.
 *
 * The test tools default `timeStamp` to `0`, so a test sets it to move
 * time between presses for {@link keySequences}.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type GlobalPayload<P> = P & {
  readonly defaultPrevented: boolean
  readonly timeStamp: number
}

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
 * `defaultPrevented` and `timeStamp` included, and a function that cancels the event's
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
  custom = false,
  held?: true
): Subscription.Subscription<any> => {
  const capture = options?.capture === true
  const declared: globalEvents.Listener = {
    target,
    event,
    capture,
    handler,
    preventDefault: options?.preventDefault,
    held
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
    // What a `keySequences` declaration holds, kept while the key's declarations are ones.
    let state: globalEvents.Held = {}
    return {
      initial: Effect.void,
      close: source.listen(
        target,
        event,
        { capture, custom },
        (payload, preventDefault) =>
          enter((latest) => {
            const listener = globalEvents.listenerOf(latest) ?? declared
            if (!listener.held) state = {}
            try {
              globalEvents.run(listener, payload, preventDefault, emit, state)
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
 * {@link onDocument} instead. For rows of several keys, such as `g` then
 * `l`, use {@link keySequences}.
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
 * The options of {@link keySequences}: those of {@link onDocument}, and
 * `timeout`, the longest gap allowed between two presses of a row.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface KeySequenceOptions extends GlobalEventOptions {
  readonly timeout?: Duration.Input | undefined
}

/**
 * A Subscription that listens for a table of shortcuts on the host's
 * document whose rows can take several keys in turn, such as `g` then `l`.
 *
 * **When to use**
 *
 * Use for Vim- or GitHub-style key sequences. For single-key rows only, use
 * {@link shortcuts}, which is smaller.
 *
 * **Details**
 *
 * A row is a `HtmlKeyboard.Shortcut` with one `key`, or a
 * `HtmlKeyboard.Sequence` with `keys`. Each press is matched with the
 * presses so far against the latest table, and the first row they match or
 * begin wins: a complete row sends its message, and a begun one waits for
 * the next press. So a row that an earlier one begins or completes can never
 * fire, and in development `keySequences` throws for it, naming both.
 *
 * A press more than `timeout` (`1 second` by default) after the one before
 * starts over, measured with the events' `timeStamp`, so no timer runs. A
 * press that doesn't continue a row is matched again as a first press. A
 * modifier key's own press, or an auto-repeat, that no row takes keeps the
 * presses so far, and a `composing` or `defaultPrevented` press drops them.
 * They also end when the entry is gated off.
 *
 * `preventDefault` defaults to `true`, and then cancels every press a row
 * takes, a begun row's included. Such a press counts as handled in a test.
 * The key is that of {@link onDocument}: `@effect/ui/html/document:"keydown"`.
 *
 * **Example** (Go-to shortcuts)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ WentToList: {}, WentToBoard: {} })
 *
 * const Nav = Html.component({
 *   name: "Nav",
 *   model: Schema.String,
 *   message: Message
 * }).make({
 *   init: () => "home",
 *   update: { WentToList: () => "list", WentToBoard: () => "board" },
 *   view: (h, page) => h.p(page),
 *   subscriptions: () => [
 *     HtmlSubscription.keySequences([
 *       { keys: ["g", "l"], message: Message.WentToList() },
 *       { keys: ["g", "b"], message: Message.WentToBoard() }
 *     ])
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Nav, {})
 *   s.fireDocument("keydown", { key: "g", timeStamp: 0 })
 *     .fireDocument("keydown", { key: "l", timeStamp: 400 })
 *     .expect(Locator.text("list")).toExist()
 *     // Too late: `b` starts over, and begins no row.
 *     .fireDocument("keydown", { key: "g", timeStamp: 1000 })
 *     .fireDocument("keydown", { key: "b", timeStamp: 2500 }).expectIgnored()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const keySequences = <
  const Rows extends ReadonlyArray<
    HtmlKeyboard.Shortcut<unknown> | HtmlKeyboard.Sequence<unknown>
  >
>(
  table: Rows,
  options?: KeySequenceOptions | undefined
): Subscription.Subscription<Rows[number]["message"]> => {
  checkSequences(table)
  const timeout = Duration.toMillis(options?.timeout ?? 1000)
  const step: globalEvents.Step = (
    payload: GlobalPayload<Html.KeyPayload>,
    held
  ) => {
    const pending = held.value as Pending | undefined
    held.value = undefined
    if (payload.composing || payload.defaultPrevented) return
    // A custom `GlobalEvents` source may not supply it.
    const at = payload.timeStamp ?? 0
    // A clock that went back counts as expired too.
    const gap = pending === undefined ? -1 : at - pending.at
    const tries = gap >= 0 && gap <= timeout
      ? [[...pending!.presses, payload], [payload]]
      : [[payload]]
    for (const presses of tries) {
      for (const row of table) {
        const want = "keys" in row ? row.keys : [row.key]
        if (
          presses.length <= want.length &&
          presses.every((press, i) => keys.matches(row, want[i]!, press))
        ) {
          if (presses.length === want.length) return row.message
          held.value = { presses, at }
          return globalEvents.consumed
        }
      }
    }
    if (payload.repeat || modifiers.includes(payload.key)) held.value = pending
  }
  return listenFor(
    "document",
    "keydown",
    step,
    { ...options, preventDefault: options?.preventDefault ?? true },
    false,
    true
  )
}

interface Pending {
  readonly presses: ReadonlyArray<Html.KeyPayload>
  readonly at: number
}

const modifiers = ["Shift", "Control", "Alt", "Meta", "AltGraph"]

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
    const send = sendLatest(
      emit,
      fail,
      enter,
      (latest) => (mediaQueries.listenerOf(latest) ?? declared).handler
    )
    // A change that fires while a handler runs is queued, so messages
    // dispatch in the order the values arrived.
    let queue: Array<boolean> | undefined
    const deliver = (values: Array<boolean>) => {
      if (queue !== undefined) return void queue.push(...values)
      queue = values
      for (let i = 0; i < queue.length; i++) send(queue[i])
      queue = undefined
    }
    // Deliver the captured match before changes, even if they precede `initial`.
    let first = source.matches(query)
    const takeFirst = (): Array<boolean> => {
      const initial = first
      first = undefined
      return initial === undefined ? [] : [initial]
    }
    return {
      initial: Effect.sync(() => deliver(takeFirst())),
      close: source.listen(
        query,
        (matches) => deliver([...takeFirst(), matches])
      )
    }
  }
  return Object.assign(
    Subscription.make("@effect/ui/html/mediaQuery", query, () => Stream.never),
    { [mediaQueries.mediaQuery]: declared, [services.direct]: direct }
  )
}
