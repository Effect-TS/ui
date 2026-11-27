import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as queryCore from "../../internal/queryCore.ts"
import * as Html from "../Html.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"
import * as files from "./files.ts"
import * as frames from "./frames.ts"
import * as globalEvents from "./globalEvents.ts"
import * as images from "./images.ts"
import * as mediaQueries from "./mediaQueries.ts"
import * as modals from "./modals.ts"
import { noteKey, payloadOf } from "./payload.ts"

const signals = (document: Document) => {
  const view = document.defaultView
  const visibility = queryCore.makeSignal(document.visibilityState !== "hidden")
  const connectivity = queryCore.makeSignal(view?.navigator?.onLine !== false)
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

const isInput = (event: Event, view: Window & typeof globalThis): boolean =>
  event.isTrusted &&
  (event instanceof view.MouseEvent || event instanceof view.KeyboardEvent ||
    (typeof view.TouchEvent === "function" && event instanceof view.TouchEvent))

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
          defaultPrevented: event.defaultPrevented,
          timeStamp: event.timeStamp,
          modal: modals.open(document)
        },
        () => event.preventDefault()
      )
    // Not `noteKey` itself, which subscriptions would share and lose when the first one stops.
    const note = !custom && name === "keyup"
      ? (event: Event) => noteKey(event)
      : undefined
    if (note !== undefined) {
      on.addEventListener("keydown", note, true)
      on.addEventListener("keyup", note, true)
    }
    on.addEventListener(name, f, { capture })
    return () => {
      on.removeEventListener(name, f, { capture })
      if (note !== undefined) {
        on.removeEventListener("keydown", note, true)
        on.removeEventListener("keyup", note, true)
      }
    }
  }
})

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

const mediaQueriesOf = (
  document: Document
): HtmlSubscription.MediaQueries => {
  const view = document.defaultView
  if (view === null || typeof view.matchMedia !== "function") {
    return mediaQueries.silent
  }
  return {
    matches: (query) => view.matchMedia(query).matches,
    listen: (query, listener) => {
      const list = view.matchMedia(query)
      const onChange = (event: MediaQueryListEvent) => listener(event.matches)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    }
  }
}

/** @internal */
export const make = (
  document: Document,
  htmlHost: Context.Service.Shape<typeof Html.Host>,
  held: () => boolean
) =>
  Effect.suspend(() => {
    const signal = signals(document)
    const context: Context.Context<any> = Context.make(Html.Host, htmlHost)
      .pipe(
        Context.add(queryCore.Visibility, signal.visibility),
        Context.add(queryCore.Connectivity, signal.connectivity),
        Context.add(globalEvents.GlobalEvents, globalEventsOf(document, held)),
        Context.add(frames.AnimationFrames, framesOf(document)),
        Context.add(mediaQueries.MediaQueries, mediaQueriesOf(document)),
        Context.add(images.Images, {
          load: (source) => images.loader!(document, source)
        }),
        Context.add(files.Files, {
          pick: (options) => files.browser!.pick(document, htmlHost, options),
          download: (file) => files.browser!.download(document, file)
        })
      )
    return Effect.as(
      Effect.addFinalizer(() => Effect.sync(signal.dispose)),
      context
    )
  })
