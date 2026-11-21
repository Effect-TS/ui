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

export const click = (target: Element, pointerType = "mouse") => {
  press(target, pointerType)
  target.dispatchEvent(new PointerEvent("click", { bubbles: true, composed: true, detail: 1, pointerType }))
}

/**
 * happy-dom has no popover API. Showing one sends `beforetoggle`, and focuses
 * an `autofocus` element in it, or in a `<dialog>` the first field, as a
 * browser does before the dialog's own mount starts. Its `:disabled` also
 * misses a control in a disabled fieldset.
 */
export const popovers = Effect.acquireRelease(
  Effect.sync(() => {
    const showing = new Set<Element>()
    const proto = window.HTMLElement.prototype as any
    const elementProto = window.Element.prototype as any
    const matches = elementProto.matches
    proto.showPopover = function(this: HTMLElement) {
      this.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState: "open" }))
      showing.add(this)
      const field = this.localName === "dialog"
        ? ",input,button,select,textarea,a[href],[tabindex]:not([tabindex^='-'])"
        : ""
      this.querySelector<HTMLElement>("[autofocus]" + field)?.focus()
    }
    proto.hidePopover = function(this: HTMLElement) {
      showing.delete(this)
    }
    elementProto.matches = function(this: Element, selector: string) {
      if (selector === ":popover-open") return showing.has(this)
      return matches.call(this, selector) || (selector === ":disabled" &&
        matches.call(this, "button,input,select,textarea") && this.closest("fieldset[disabled]") !== null)
    }
    return () => {
      delete proto.showPopover
      delete proto.hidePopover
      elementProto.matches = matches
    }
  }),
  (restore) => Effect.sync(restore)
)

class FakeVisualViewport extends EventTarget {
  height = 800
  offsetTop = 0
  scale = 1
  move(changes: Partial<Pick<FakeVisualViewport, "height" | "offsetTop">>, type: "resize" | "scroll" = "resize") {
    Object.assign(this, changes)
    this.dispatchEvent(new Event(type))
  }
}

// happy-dom drops `100svh`, so the hidden element that measures it is stubbed.
export const isViewportProbe = (element: Element) =>
  element.parentElement === document.body && (element as HTMLElement).style.visibility === "hidden" &&
  (element as HTMLElement).style.position === "fixed"

export const visualViewport = Effect.acquireRelease(
  Effect.sync(() => {
    const html = window.HTMLElement.prototype
    const offsetHeight = Object.getOwnPropertyDescriptor(html, "offsetHeight")!
    const visual = new FakeVisualViewport()
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visual })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
    Object.defineProperty(html, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return isViewportProbe(this) ? 800 : offsetHeight.get!.call(this)
      }
    })
    return { visual, offsetHeight }
  }),
  ({ offsetHeight }) =>
    Effect.sync(() => {
      Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", offsetHeight)
      delete (window as { visualViewport?: unknown }).visualViewport
      delete (window as { innerHeight?: unknown }).innerHeight
    })
)
