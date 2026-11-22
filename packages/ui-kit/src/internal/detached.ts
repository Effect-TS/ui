import * as DomSubscription from "@effect/ui/html/DomSubscription"
import * as Subscription from "@effect/ui/Subscription"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

export interface DetachedChannel<M> {
  readonly send: (document: Document, popupId: string, message: M) => void
  readonly subscription: (popupId: string) => Subscription.Subscription<M>
}

// A trigger reaches only the popups of its own document, through an event dispatched there. The host
// hands a listener the event's payload, not the event, so the message waits in `sending` meanwhile.
export const detachedChannel = <M>(name: string): DetachedChannel<M> => {
  const type = `effect-ui-kit:${name}`
  let sending: { readonly popupId: string; readonly message: M } | undefined
  return {
    send: (document, popupId, message) => {
      sending = { popupId, message }
      try {
        document.dispatchEvent(new Event(type))
      } finally {
        sending = undefined
      }
    },
    subscription: (popupId) =>
      Subscription.make(
        name,
        popupId,
        (id) =>
          Stream.callback<M>((queue) =>
            DomSubscription.GlobalEvents.use((events) =>
              Effect.acquireRelease(
                Effect.sync(() =>
                  events.listen("document", type, { capture: false }, () => {
                    if (sending !== undefined && sending.popupId === id) Queue.offerUnsafe(queue, sending.message)
                  })
                ),
                (close) => Effect.sync(close)
              )
            )
          )
      )
  }
}
