import { Effect } from "effect"

/** Long enough for a mount, its first frame and the messages they send. */
export const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 60)))

/** An element in the document to mount in, removed as the scope closes. */
export const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

export const byId = (id: string) => document.getElementById(id)!

export const holdExits = Effect.acquireRelease(
  Effect.sync(() => {
    const original = Element.prototype.getAnimations
    let finish = () => {}
    const running = {
      effect: { getComputedTiming: () => ({ endTime: 200 }) },
      finished: new Promise<void>((resolve) => (finish = resolve))
    } as unknown as Animation
    Element.prototype.getAnimations = function(this: Element) {
      return this.hasAttribute("data-ending-style") ? [running] : []
    }
    return { original, finish: () => finish() }
  }),
  ({ original }) => Effect.sync(() => (Element.prototype.getAnimations = original))
)

export const focusVisibility = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.HTMLElement.prototype
    const focus = proto.focus
    const calls: Array<readonly [string, boolean]> = []
    proto.focus = function(this: HTMLElement, options?: FocusOptions) {
      calls.push([this.id, (options as { readonly focusVisible?: boolean } | undefined)?.focusVisible === true])
      focus.call(this, options)
    }
    return { calls, restore: () => (proto.focus = focus) }
  }),
  ({ restore }) => Effect.sync(restore)
).pipe(Effect.map(({ calls }) => calls))

/** A primary-button `pointerdown`, which is what an outside press listens for. */
export const press = (target: Element, pointerType = "mouse") =>
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, isPrimary: true, pointerType, button: 0 })
  )

export const click = (target: Element, pointerType = "mouse") => {
  press(target, pointerType)
  target.dispatchEvent(new PointerEvent("click", { bubbles: true, composed: true, detail: 1, pointerType }))
}

/** happy-dom's `:disabled` misses a control in a disabled fieldset. */
export const fieldsetDisabled = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.Element.prototype as any
    const matches = proto.matches
    proto.matches = function(this: Element, selector: string) {
      return matches.call(this, selector) || (selector === ":disabled" &&
        matches.call(this, "button,input,select,textarea") && this.closest("fieldset[disabled]") !== null)
    }
    return () => {
      proto.matches = matches
    }
  }),
  (restore) => Effect.sync(restore)
)

/** happy-dom focuses any element, such as a `<div>` with no `tabindex`. */
export const focusability = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.HTMLElement.prototype
    const focus = proto.focus
    proto.focus = function(this: HTMLElement, options) {
      if (this.tabIndex >= 0 || this.hasAttribute("tabindex")) focus.call(this, options)
    }
    return () => {
      proto.focus = focus
    }
  }),
  (restore) => Effect.sync(restore)
)

/**
 * happy-dom has no popover API. Showing one sends `beforetoggle`, and focuses
 * an `autofocus` element in it, or in a `<dialog>` the first field, as a
 * browser does before the dialog's own mount starts.
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
      return selector === ":popover-open" ? showing.has(this) : matches.call(this, selector)
    }
    return () => {
      delete proto.showPopover
      delete proto.hidePopover
      elementProto.matches = matches
    }
  }),
  (restore) => Effect.sync(restore)
).pipe(Effect.andThen(fieldsetDisabled))

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
