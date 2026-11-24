import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as queryCore from "../../internal/queryCore.ts"
import * as Html from "../Html.ts"
import * as HtmlFiles from "../HtmlFiles.ts"
import * as HtmlImages from "../HtmlImages.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"
import * as frames from "./frames.ts"
import * as globalEvents from "./globalEvents.ts"
import { payloadOf } from "./payload.ts"

// Visibility follows `visibilitychange` only, never the window's `focus`. Connectivity
// starts true and follows `online` and `offline` on the document's own window.
const signals = (document: Document) => {
  const visibility = queryCore.makeSignal(document.visibilityState !== "hidden")
  const connectivity = queryCore.makeSignal(true)
  const view = document.defaultView
  const onVisibility = () =>
    visibility.set(document.visibilityState !== "hidden")
  const onOnline = () => connectivity.set(true)
  const onOffline = () => connectivity.set(false)
  document.addEventListener("visibilitychange", onVisibility)
  view?.addEventListener("online", onOnline)
  view?.addEventListener("offline", onOffline)
  return {
    visibility,
    connectivity,
    dispose: () => {
      document.removeEventListener("visibilitychange", onVisibility)
      view?.removeEventListener("online", onOnline)
      view?.removeEventListener("offline", onOffline)
    }
  }
}

// `HtmlSubscription.onDocument`, `onCustomEvent` and `onWindow` listen here. Each Subscription
// removes its own listener as it stops. A pointer payload's `pointerType` comes from the event alone.
const globalEventsOf = (
  document: Document,
  held: () => boolean
): HtmlSubscription.GlobalEvents => ({
  listen: (target, name, { capture, custom }, listener) => {
    const on = target === "document" ? document : document.defaultView
    if (on === null) return () => {}
    const view = document.defaultView
    const f = (event: Event) =>
      view !== null && held() && isInput(event, view) ? undefined : listener(
        {
          ...(custom === true
            ? { detail: (event as CustomEvent).detail ?? null }
            : payloadOf(
              name,
              event,
              event.target,
              document.documentElement,
              undefined
            ) as object),
          defaultPrevented: event.defaultPrevented
        },
        () => event.preventDefault()
      )
    on.addEventListener(name, f, { capture })
    return () => on.removeEventListener(name, f, { capture })
  }
})

const isInput = (event: Event, view: Window & typeof globalThis): boolean =>
  event.isTrusted &&
  (event instanceof view.MouseEvent || event instanceof view.KeyboardEvent ||
    (typeof view.TouchEvent === "function" && event instanceof view.TouchEvent))

const framesOf = (document: Document): HtmlSubscription.AnimationFrames => {
  const view = document.defaultView
  return {
    now: () => view?.performance.now() ?? 0,
    listen: (listener) => {
      if (view === null || typeof view.requestAnimationFrame !== "function") {
        return () => {}
      }
      const frame = (time: number) => {
        id = view.requestAnimationFrame(frame)
        listener(time)
      }
      let id = view.requestAnimationFrame(frame)
      return () => view.cancelAnimationFrame(id)
    }
  }
}

// Loads in a detached <img>. A cached image may already be complete.
const imagesOf = (document: Document): HtmlImages.Images => ({
  load: (source) =>
    Effect.callback((resume) => {
      const image = document.createElement("img")
      const settle = (status: "loaded" | "error") =>
        resume(Effect.succeed(status))
      if (source.referrerPolicy !== undefined) {
        image.referrerPolicy = source.referrerPolicy
      }
      image.crossOrigin = source.crossOrigin ?? null
      if (source.sizes !== undefined) image.sizes = source.sizes
      if (source.srcSet !== undefined) image.srcset = source.srcSet
      if (source.src !== undefined) image.src = source.src
      if (image.complete) {
        return settle(
          image.naturalWidth > 0 ? "loaded" : "error"
        )
      }
      image.onload = () => settle("loaded")
      image.onerror = () => settle("error")
      return Effect.sync(() => {
        image.onload = null
        image.onerror = null
      })
    })
})

const filesOf = (
  document: Document,
  htmlHost: Context.Service.Shape<typeof Html.Host>
): HtmlFiles.Files => ({
  pick: (options) =>
    Effect.callback((resume) => {
      const input = document.createElement("input")
      input.type = "file"
      input.multiple = options.multiple === true
      if (options.accept !== undefined) input.accept = options.accept.join(",")
      if (options.capture !== undefined) {
        input.setAttribute("capture", options.capture)
      }
      const settle = (files: ReadonlyArray<File>) =>
        resume(Effect.succeed({ opened: true, files }))
      input.onchange = () => settle(Array.from(input.files ?? []))
      input.oncancel = () => settle([])
      if (!htmlHost.showPicker(input)) {
        return resume(Effect.succeed({ opened: false, files: [] }))
      }
      return Effect.sync(() => {
        input.onchange = null
        input.oncancel = null
      })
    })
})

const never = () => false

/** @internal */
export const make = Effect.fnUntraced(function*(
  document: Document,
  htmlHost: Context.Service.Shape<typeof Html.Host>,
  held: () => boolean = never
) {
  const signal = signals(document)
  yield* Effect.addFinalizer(() => Effect.sync(signal.dispose))
  return Context.make(Html.Host, htmlHost).pipe(
    Context.add(queryCore.Visibility, signal.visibility),
    Context.add(queryCore.Connectivity, signal.connectivity),
    Context.add(globalEvents.GlobalEvents, globalEventsOf(document, held)),
    Context.add(frames.AnimationFrames, framesOf(document)),
    Context.add(HtmlImages.Images, imagesOf(document)),
    Context.add(HtmlFiles.Files, filesOf(document, htmlHost))
  )
})
