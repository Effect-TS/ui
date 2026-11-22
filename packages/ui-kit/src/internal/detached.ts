import * as Subscription from "@effect/ui/Subscription"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

export interface DetachedChannel<M> {
  readonly send: (popupId: string, message: M) => void
  readonly subscription: (popupId: string) => Subscription.Subscription<M>
}

export const detachedChannel = <M>(name: string): DetachedChannel<M> => {
  const receivers = new Map<string, (message: M) => void>()
  return {
    send: (popupId, message) => receivers.get(popupId)?.(message),
    subscription: (popupId) =>
      Subscription.make(name, popupId, (id) =>
        Stream.callback<M>((queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const receive = (message: M) => {
                Queue.offerUnsafe(queue, message)
              }
              receivers.set(id, receive)
              return receive
            }),
            (receive) =>
              Effect.sync(() => {
                if (receivers.get(id) === receive) receivers.delete(id)
              })
          )
        ))
  }
}
