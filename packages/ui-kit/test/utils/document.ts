import { Effect } from "effect"

/** Long enough for a mount, its first frame and the messages they send. */
export const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 60)))

/** An element in the document to mount in, removed as the scope closes. */
export const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

export const byId = (id: string) => document.getElementById(id)!

/** A primary-button `pointerdown`, which is what an outside press listens for. */
export const press = (target: Element, pointerType = "mouse") =>
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, isPrimary: true, pointerType, button: 0 })
  )
