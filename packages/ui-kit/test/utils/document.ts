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

/** A press that starts and ends on `target`, as a click outside listens for. */
export const click = (target: Element, pointerType = "mouse") => {
  press(target, pointerType)
  target.dispatchEvent(new PointerEvent("click", { bubbles: true, composed: true, detail: 1, pointerType }))
}

/**
 * happy-dom has no popover API. What the kit relies on is that showing and
 * hiding one changes `:popover-open`, and that showing one focuses an
 * `autofocus` element in it, as a browser does before the dialog's own mount
 * starts.
 */
export const popovers = Effect.acquireRelease(
  Effect.sync(() => {
    const showing = new Set<Element>()
    const proto = window.HTMLElement.prototype as any
    const elementProto = window.Element.prototype as any
    const matches = elementProto.matches
    proto.showPopover = function(this: HTMLElement) {
      showing.add(this)
      this.querySelector<HTMLElement>("[autofocus]")?.focus()
    }
    proto.hidePopover = function(this: HTMLElement) {
      showing.delete(this)
    }
    elementProto.matches = function(this: Element, selector: string) {
      return selector === ":popover-open" ? showing.has(this) : matches.call(this, selector)
    }
    return () => {
      delete proto.showPopover
      delete proto.hidePopover
      elementProto.matches = matches
    }
  }),
  (restore) => Effect.sync(restore)
)
