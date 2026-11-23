import * as DomSubscription from "@effect/ui/html/DomSubscription"
import type * as Subscription from "@effect/ui/Subscription"
import * as Predicate from "effect/Predicate"

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
        ({ detail }) => Predicate.hasProperty(detail, tag) ? detail[tag] as M : undefined
      )
  }
}
