/**
 * Global terminal Subscriptions for OpenTUI: `onKeyPress`, `onKeyRelease`,
 * `shortcuts`, `onPaste`, and `onResize`.
 *
 * Backed by the `GlobalEvents` `Context.Reference` provided by
 * `OpenTuiHost.layer` (or faked in tests with `TestOpenTuiEvents.layer`).
 * Handlers run synchronously via `Subscription.direct` so `preventDefault`
 * cancels delivery to focused renderables before OpenTUI dispatches the key.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import type * as OpenTui from "./OpenTui.ts"
import * as OpenTuiKeyboard from "./OpenTuiKeyboard.ts"

/**
 * Global terminal events available through `OpenTuiSubscription`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface TerminalEvents {
  readonly keypress: OpenTui.KeyPayload
  readonly keyrelease: OpenTui.KeyPayload
  readonly paste: OpenTui.PastePayload
  readonly resize: OpenTui.ResizePayload
}

/**
 * A global event payload augmented with whether an earlier listener already
 * cancelled the event's default.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export type GlobalPayload<P> = P & { readonly defaultPrevented: boolean }

/**
 * The source of global terminal events read by `OpenTuiSubscription`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface GlobalEvents {
  readonly listen: <K extends keyof TerminalEvents>(
    event: K,
    listener: (
      payload: GlobalPayload<TerminalEvents[K]>,
      preventDefault: () => void
    ) => void
  ) => () => void
}

const silent: GlobalEvents = { listen: () => () => {} }

/**
 * The `GlobalEvents` reference. Defaults to a silent source that never fires.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const GlobalEvents: Context.Reference<GlobalEvents> = Context.Reference<
  GlobalEvents
>("@effect/ui-opentui/OpenTuiSubscription/GlobalEvents", {
  defaultValue: () => silent
})

interface DeclaredListener {
  readonly handler: View.Handler<unknown, any>
  readonly preventDefault: boolean | "always" | undefined
}

const invokeHandler = <Msg, Payload>(
  handler: View.Handler<Msg, Payload>,
  payload: Payload
): Msg | undefined =>
  typeof handler === "function"
    ? (handler as (payload: Payload) => Msg | undefined)(payload)
    : handler

const listenFor = <K extends keyof TerminalEvents, Msg>(
  event: K,
  handler: View.Handler<Msg, GlobalPayload<TerminalEvents[K]>>,
  options?: View.EventOptions | undefined
): Subscription.Subscription<Msg> => {
  const declared: DeclaredListener = {
    handler,
    preventDefault: options?.preventDefault
  }
  return Subscription.direct<DeclaredListener, Msg>(
    "@effect/ui-opentui/terminal",
    event,
    declared,
    (context, { emit, enter, fail }) =>
      Context.get(context, GlobalEvents).listen(
        event,
        (payload, preventDefault) =>
          enter((latest) => {
            try {
              if (latest.preventDefault === "always") preventDefault()
              const message = invokeHandler(latest.handler, payload)
              if (message !== undefined) {
                emit(
                  message as Msg,
                  latest.preventDefault === true ? preventDefault : undefined
                )
              }
            } catch (error) {
              fail(Cause.die(error))
            }
          })
      )
  )
}

/**
 * Subscribes to global terminal key presses.
 *
 * **Details**
 *
 * With `{ preventDefault: true }`, returning a message synchronously calls
 * `KeyEvent.preventDefault()` so the focused renderable does not consume the
 * key. With `"always"`, the default is always cancelled.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onKeyPress = <Msg>(
  handler: View.Handler<Msg, GlobalPayload<OpenTui.KeyPayload>>,
  options?: View.EventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("keypress", handler, options)

/**
 * Subscribes to global terminal key releases (when the terminal reports them).
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onKeyRelease = <Msg>(
  handler: View.Handler<Msg, GlobalPayload<OpenTui.KeyPayload>>,
  options?: View.EventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("keyrelease", handler, options)

/**
 * Subscribes to global terminal paste events.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onPaste = <Msg>(
  handler: View.Handler<Msg, GlobalPayload<OpenTui.PastePayload>>,
  options?: View.EventOptions | undefined
): Subscription.Subscription<Msg> => listenFor("paste", handler, options)

/**
 * Subscribes to terminal resize events.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onResize = <Msg>(
  handler: View.Handler<Msg, GlobalPayload<OpenTui.ResizePayload>>
): Subscription.Subscription<Msg> => listenFor("resize", handler)

/**
 * Subscribes to a table of single-key global shortcuts on `"keypress"`.
 * `preventDefault` defaults to `true`.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const shortcuts = <
  const Rows extends ReadonlyArray<OpenTuiKeyboard.Shortcut<unknown>>
>(
  table: Rows,
  options?: View.EventOptions | undefined
): Subscription.Subscription<Rows[number]["message"]> =>
  onKeyPress(OpenTuiKeyboard.shortcuts(table), {
    ...options,
    preventDefault: options?.preventDefault ?? true
  })
