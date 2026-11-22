import * as DomSubscription from "@effect/ui/html/DomSubscription"
import type * as Subscription from "@effect/ui/Subscription"

export interface DetachedChannel<M> {
  readonly send: (document: Document, popupId: string, message: M) => void
  readonly subscription: (popupId: string) => Subscription.Subscription<M>
}

export const detachedChannel = <M>(name: string): DetachedChannel<M> => {
  const tag = Symbol(name)
  const typeOf = (popupId: string) => `effect-ui-kit:${name}:${popupId}`
  return {
    send: (document, popupId, message) => {
      document.dispatchEvent(new CustomEvent(typeOf(popupId), { detail: { [tag]: message } }))
    },
    subscription: (popupId) =>
      DomSubscription.onCustomEvent(
        typeOf(popupId),
        ({ detail }) =>
          typeof detail === "object" && detail !== null && tag in detail
            ? (detail as Record<typeof tag, M>)[tag]
            : undefined
      )
  }
}
