import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as VirtualKeyboard from "../VirtualKeyboard.ts"
import { isAndroid } from "./platform.ts"

export const TrackKeyboardArgs = {
  open: Schema.Boolean,
  modal: Schema.Union([Schema.Boolean, Schema.Literal("trap-focus")]),
  popupId: Schema.String
}

export type TrackKeyboardArgs = Schema.Struct<typeof TrackKeyboardArgs>["Type"]

export const insetProperty = "--drawer-keyboard-inset"

const margin = 16
const realignInterval = 150
const realignPasses = 4
const settleFrames = 60
const stallFrames = 3
const maxReissues = 3
const tapMove = 10
const hitSlop = 16
const interactive = "button,a[href],[role=\"button\"],select,[tabindex]:not([tabindex=\"-1\"])," +
  "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])"

const blocked = Symbol("blocked")

interface Adjustment {
  readonly element: HTMLElement
  readonly overflowAnchor: string
  readonly paddingBottom: string
  readonly scrollPaddingBottom: string
  readonly computedPaddingBottom: number
  readonly computedScrollPaddingBottom: number
}

interface TouchTarget {
  readonly focus: HTMLElement
  readonly click: HTMLElement
}

interface Pin {
  readonly x: number
  readonly y: number
  readonly left: number
  readonly top: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const isElement = (node: unknown): node is Element => (node as Node | null)?.nodeType === 1

const isHTMLElement = (node: unknown): node is HTMLElement => {
  const view = (node as Node | null)?.ownerDocument?.defaultView
  return view != null && node instanceof view.HTMLElement
}

const parentOf = (node: Node): Node | null => {
  const slot = isElement(node) ? node.assignedSlot : null
  if (slot != null) return slot
  const parent = node.parentNode
  return parent !== null && parent.nodeType === 11 && "host" in parent ? (parent as ShadowRoot).host : parent
}

const contains = (parent: Node, child: Node | null): boolean => {
  for (let node = child; node !== null; node = parentOf(node)) {
    if (node === parent) return true
  }
  return false
}

const dialogOf = (node: Node): Node | null => {
  for (let current = parentOf(node); current !== null; current = parentOf(current)) {
    if (isElement(current) && current.localName === "dialog") return current
  }
  return null
}

const targetOf = (event: Event): EventTarget | null => event.composedPath()[0] ?? event.target

const activeOf = (document: Document): Element | null => {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement
  return active
}

const elementAt = (root: Node, x: number, y: number): Element | null => {
  const from = (root as Partial<Pick<Document, "elementFromPoint">>).elementFromPoint
  return typeof from === "function" ? from.call(root, x, y) : null
}

const onRange = (event: Event): boolean =>
  event.composedPath().some((target) =>
    isHTMLElement(target) && target.localName === "input" &&
    (target as HTMLInputElement).type === "range"
  )

const lastTraversable = (node: Node): boolean =>
  node.nodeType === 9 || (isElement(node) && (node.localName === "html" || node.localName === "body"))

const scrollable = (element: HTMLElement, intent: boolean): boolean => {
  const { overflowY } = element.ownerDocument.defaultView!.getComputedStyle(element)
  if (overflowY !== "auto" && overflowY !== "scroll") return false
  return intent ? element.clientHeight > 0 : element.scrollHeight > element.clientHeight
}

const scrollerOf = (start: Node | null, root: HTMLElement, intent: boolean): HTMLElement | null => {
  for (let node = start; isElement(node) && node !== root && !lastTraversable(node); node = parentOf(node)) {
    if (isHTMLElement(node) && scrollable(node, intent)) return node
  }
  return scrollable(root, intent) ? root : null
}

const keyboardScroller = (target: HTMLElement, root: HTMLElement): HTMLElement | null => {
  const start = parentOf(target)
  return scrollerOf(start, root, false) ?? scrollerOf(start, root, true)
}

const touchTargetOf = (target: EventTarget | null): TouchTarget | null => {
  if (!isHTMLElement(target)) return null
  const focus = VirtualKeyboard.textFieldOf(target)
  return focus === null ? null : { focus, click: target }
}

const touchTargetAt = (root: Node, x: number, y: number): TouchTarget | typeof blocked | null => {
  const exact = elementAt(root, x, y)
  if (isHTMLElement(exact)) {
    const focus = VirtualKeyboard.textFieldOf(exact)
    if (focus !== null) return { focus, click: exact }
  }
  if (exact !== null && (exact.closest(interactive) !== null || exact.closest("label") !== null)) return blocked
  for (const [dx, dy] of [[0, hitSlop], [0, -hitSlop], [hitSlop, 0], [-hitSlop, 0]] as const) {
    const focus = VirtualKeyboard.textFieldOf(elementAt(root, x + dx, y + dy))
    if (focus !== null) return { focus, click: focus }
  }
  return null
}

const dispatchClick = (target: HTMLElement, touch: Pick<Touch, "clientX" | "clientY">): void => {
  const view = target.ownerDocument.defaultView!
  const Click = view.PointerEvent ?? view.MouseEvent
  target.dispatchEvent(
    new Click("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      detail: 1,
      view
    })
  )
}

// WebKit samples the painted rect of an element as it gains focus to decide its reveal
// scroll, so the rect is moved for the synchronous focus and put back before paint.
const overrideGeometry = (target: HTMLElement, translateY: number): () => void => {
  const { opacity, transform, transition } = target.style
  target.style.transition = "none"
  target.style.opacity = "0"
  target.style.transform = `translateY(${translateY}px)`
  return () => {
    target.style.opacity = opacity
    target.style.transform = transform
    target.style.transition = transition
  }
}

const focusWithoutScroll = (target: HTMLElement): void => {
  const focused = activeOf(target.ownerDocument) === target
  const restore = overrideGeometry(target, -2000)
  try {
    if (focused) target.blur()
    target.focus({ preventScroll: true })
  } finally {
    restore()
  }
}

export const trackKeyboard = (
  node: HTMLElement,
  args: TrackKeyboardArgs,
  changes: Stream.Stream<TrackKeyboardArgs>
): Stream.Stream<never> =>
  Stream.callback<never>(() => {
    const document = node.ownerDocument
    const view = document.defaultView!
    const android = isAndroid(view)
    let current = args
    let band: VirtualKeyboard.Band | null = null

    let target: HTMLElement | null = null
    let adjustment: Adjustment | null = null
    let programmatic = false
    let touchStart: { readonly x: number; readonly y: number } | null = null
    let moved = false
    let pen = false
    let restorePreempted: (() => void) | null = null
    let pin: Pin | null = null

    let scrollElement: HTMLElement | null = null
    let destination = 0
    let checks = 0
    let observed = -1
    let stalled = 0
    let reissues = 0

    let frame = -1
    let pinFrame = -1
    let timer: number | undefined

    const request = (f: () => void): void => {
      view.cancelAnimationFrame(frame)
      frame = view.requestAnimationFrame(() => {
        frame = -1
        f()
      })
    }
    const cancelFrame = (): void => {
      view.cancelAnimationFrame(frame)
      frame = -1
    }
    const startTimer = (f: () => void): void => {
      view.clearTimeout(timer)
      timer = view.setTimeout(f, realignInterval)
    }
    const clearTimer = (): void => {
      view.clearTimeout(timer)
      timer = undefined
    }

    const popup = (): HTMLElement =>
      document.querySelector<HTMLElement>("[data-drawer-popup=\"" + CSS.escape(current.popupId) + "\"]") ?? node
    const owns = (element: HTMLElement): boolean => contains(popup(), element) && dialogOf(element) === dialogOf(node)

    const setInset = (inset: number | null): void => {
      if (inset === null) node.style.removeProperty(insetProperty)
      else node.style.setProperty(insetProperty, `${Math.max(0, Math.ceil(inset))}px`)
    }

    const restoreAdjustment = (): void => {
      if (adjustment === null) return
      const { element } = adjustment
      element.style.overflowAnchor = adjustment.overflowAnchor
      element.style.paddingBottom = adjustment.paddingBottom
      element.style.scrollPaddingBottom = adjustment.scrollPaddingBottom
      adjustment = null
    }

    const setSlack = (element: HTMLElement, slack: number): void => {
      const rounded = Math.max(0, Math.ceil(slack))
      if (adjustment !== null && !adjustment.element.isConnected) restoreAdjustment()
      if (rounded === 0) return restoreAdjustment()
      if (adjustment !== null && adjustment.element !== element) restoreAdjustment()
      if (adjustment === null) {
        const style = view.getComputedStyle(element)
        adjustment = {
          element,
          overflowAnchor: element.style.overflowAnchor,
          paddingBottom: element.style.paddingBottom,
          scrollPaddingBottom: element.style.scrollPaddingBottom,
          computedPaddingBottom: Number.parseFloat(style.paddingBottom) || 0,
          computedScrollPaddingBottom: Number.parseFloat(style.scrollPaddingBottom) || 0
        }
      }
      element.style.overflowAnchor = "none"
      element.style.paddingBottom = `${rounded + Math.max(adjustment.computedPaddingBottom, margin)}px`
      element.style.scrollPaddingBottom = `${adjustment.computedScrollPaddingBottom + margin}px`
    }

    const scrollTo = (element: HTMLElement, top: number): void => {
      const reduce = view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
      element.scrollTo({ top, behavior: reduce ? "auto" : "smooth" })
    }

    const snapshot = (): Pin => ({
      x: view.scrollX,
      y: view.scrollY,
      left: document.body?.scrollLeft ?? 0,
      top: document.body?.scrollTop ?? 0
    })

    // WebKit's reveal scroll moves a locked page, such as when the keyboard's arrows move
    // focus, and the scroll lock may hold the page's scroll on <body> instead of the window.
    const restoreScroll = (): boolean => {
      if (current.modal !== true || pin === null || target === null || band === null) return false
      const body = document.body
      const page = view.scrollX !== pin.x || view.scrollY !== pin.y
      const held = body !== null && (body.scrollLeft !== pin.left || body.scrollTop !== pin.top)
      if (page) view.scrollTo({ left: pin.x, top: pin.y, behavior: "instant" })
      if (held) body.scrollTo({ left: pin.left, top: pin.top, behavior: "instant" })
      return page || held
    }

    const consumePreempted = (): void => {
      restorePreempted?.()
      restorePreempted = null
    }

    const preempt = (field: HTMLElement, visible: VirtualKeyboard.Band): void => {
      consumePreempted()
      const rect = field.getBoundingClientRect()
      restorePreempted = overrideGeometry(field, (visible.top + visible.bottom - rect.top - rect.bottom) / 2)
    }

    const align = (): void => {
      consumePreempted()
      const field = target
      if (field === null || !contains(node, field)) {
        setInset(null)
        restoreAdjustment()
        return
      }
      restoreScroll()
      const visible = band
      if (visible === null) {
        setInset(null)
        restoreAdjustment()
        return
      }
      setInset(visible.inset)
      const scroller = keyboardScroller(field, node)
      if (scroller === null) return restoreAdjustment()
      const scrollerRect = scroller.getBoundingClientRect()
      const clippedBottom = Math.min(scrollerRect.bottom, visible.bottom)
      const overlap = scrollerRect.bottom - visible.bottom
      setSlack(scroller, overlap > 1 ? overlap : 0)
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      if (maxScrollTop <= 0) return
      const clippedTop = Math.max(scrollerRect.top, visible.top)
      const visibleTop = clippedTop + margin
      const visibleBottom = clippedBottom - margin
      if (visibleBottom <= visibleTop) return
      const rect = field.getBoundingClientRect()
      let offset = (rect.top + rect.bottom - visibleTop - visibleBottom) / 2
      if (android) {
        const space = clamp((clippedBottom - clippedTop - rect.height) / 2, 0, margin)
        offset = 0
        if (rect.top < clippedTop) offset = rect.top - clippedTop - space
        else if (rect.bottom > clippedBottom) {
          offset = Math.min(rect.bottom - clippedBottom + space, rect.top - clippedTop - space)
        }
      }
      const next = Math.round(clamp(scroller.scrollTop + offset, 0, maxScrollTop))
      if (android && Math.abs(scroller.scrollTop - next) <= 1) {
        scrollElement = null
        return
      }
      // WebKit restarts a smooth scroll issued again while the layout viewport resizes.
      const settled = scrollElement === scroller && !visible.resizing && Math.abs(destination - next) <= 1
      if (!settled) {
        const count = scrollElement === scroller ? checks + 1 : 1
        scrollElement = scroller
        destination = next
        checks = count
        observed = -1
        reissues = 0
        if (count <= settleFrames) return request(align)
      } else if (observed >= 0) {
        const at = scroller.scrollTop
        if (!android) {
          if (Math.abs(at - next) <= 1) return
          if (at !== observed) {
            observed = at
            return
          }
        } else {
          // Chrome cancels a smooth scroll when its reveal of the focused field lands.
          if (at !== observed) {
            observed = at
            stalled = 0
            return request(align)
          }
          stalled += 1
          if (stalled < stallFrames) return request(align)
          if (reissues >= maxReissues) return
          reissues += 1
        }
      }
      scrollElement = scroller
      destination = next
      checks = 0
      observed = scroller.scrollTop
      stalled = 0
      scrollTo(scroller, next)
      if (android) request(align)
    }

    const realignLater = (): void => {
      let remaining = realignPasses
      const realign = (): void => {
        align()
        remaining -= 1
        if (remaining > 0) startTimer(realign)
      }
      startTimer(realign)
    }

    const release = (): void => {
      target = null
      clearTimer()
      request(align)
    }

    const capture = (eventTarget: EventTarget | null): boolean => {
      const field = VirtualKeyboard.textFieldOf(eventTarget)
      if (field === null || !owns(field)) return false
      if (target !== field) scrollElement = null
      target = field
      return true
    }

    // Some iOS versions dispatch `focus` before recording the focus options, losing `preventScroll`.
    const onFocus = (event: FocusEvent): void => {
      if (restorePreempted !== null && target !== null && target === targetOf(event)) {
        target.focus({ preventScroll: true })
      }
    }

    const onFocusIn = (event: FocusEvent): void => {
      programmatic = false
      consumePreempted()
      if (!capture(targetOf(event))) return release()
      if (band !== null) realignLater()
      request(align)
    }

    // A native focus move, such as the keyboard's arrows, commits WebKit's reveal scroll
    // before `focusin`, so the incoming field is shown as already in the band here.
    const onFocusOut = (event: FocusEvent): void => {
      if (programmatic) return
      if (capture(event.relatedTarget)) {
        if (target !== null && band !== null) preempt(target, band)
        request(align)
        return
      }
      release()
    }

    const onViewport = (): void => {
      if (target !== null || capture(activeOf(document))) request(align)
    }

    const onScroll = (event: Event): void => {
      if (event.target !== document && event.target !== document.body) return
      if (restoreScroll()) request(align)
    }

    const onPointerDown = (): void => {
      if (target !== null) cancelFrame()
      clearTimer()
      scrollElement = null
    }

    const resetTouch = (): void => {
      moved = false
      touchStart = null
    }

    const onNodePointerDown = (event: PointerEvent): void => {
      pen = event.pointerType === "pen"
    }

    const onTouchStart = (event: TouchEvent): void => {
      if (pen) {
        pen = false
        return resetTouch()
      }
      const touch = event.touches[0]
      if (touch === undefined) return
      const eventTarget = targetOf(event)
      if (onRange(event) || !isElement(eventTarget) || !contains(node, eventTarget)) return resetTouch()
      moved = false
      touchStart = { x: touch.clientX, y: touch.clientY }
    }

    const onTouchMove = (event: TouchEvent): void => {
      const touch = event.touches[0]
      if (touch === undefined || touchStart === null || moved) return
      if (Math.abs(touch.clientX - touchStart.x) > tapMove || Math.abs(touch.clientY - touchStart.y) > tapMove) {
        moved = true
      }
    }

    const onTouchEnd = (event: TouchEvent): void => {
      pen = false
      if (!current.open || touchStart === null || moved) return resetTouch()
      const touch = event.changedTouches[0] ?? event.touches[0]
      if (touch === undefined) return resetTouch()
      const atPoint = touchTargetAt(node.getRootNode(), touch.clientX, touch.clientY)
      if (atPoint === blocked) return resetTouch()
      const tapped = atPoint ?? touchTargetOf(targetOf(event))
      if (tapped === null || !owns(tapped.focus) || !contains(popup(), tapped.click)) return resetTouch()
      const viewport = view.visualViewport
      if (viewport != null && viewport.scale !== 1) return resetTouch()
      if (activeOf(document) === tapped.focus && (android || viewport == null || band !== null)) {
        return resetTouch()
      }
      // iOS opens the keyboard only for a focus inside the touch's own handler.
      event.preventDefault()
      programmatic = true
      try {
        focusWithoutScroll(tapped.focus)
      } finally {
        programmatic = false
      }
      dispatchClick(tapped.click, touch)
      // Refocusing restores the focus options WebKit drops while the keyboard opens, and
      // brings back a keyboard dismissed from the browser's own UI.
      if (activeOf(document) === tapped.focus) tapped.focus.focus({ preventScroll: true })
      resetTouch()
    }

    let controller: AbortController | null = null

    const stop = (): void => {
      controller?.abort()
      controller = null
      view.cancelAnimationFrame(pinFrame)
      consumePreempted()
      target = null
      restoreAdjustment()
      cancelFrame()
      clearTimer()
      resetTouch()
      pin = null
      setInset(null)
    }

    const start = (): void => {
      stop()
      if (!current.open) return
      controller = new AbortController()
      const { signal } = controller
      const viewport = view.visualViewport
      if (viewport != null) {
        viewport.addEventListener("resize", onViewport, { signal })
        viewport.addEventListener("scroll", onViewport, { signal })
        view.addEventListener("resize", onViewport, { signal })
      }
      document.addEventListener("focus", onFocus, { capture: true, signal })
      document.addEventListener("focusin", onFocusIn, { capture: true, signal })
      document.addEventListener("focusout", onFocusOut, { capture: true, signal })
      document.addEventListener("scroll", onScroll, { capture: true, passive: true, signal })
      document.addEventListener("pointerdown", onPointerDown, { capture: true, signal })
      node.addEventListener("pointerdown", onNodePointerDown, { capture: true, signal })
      node.addEventListener("touchstart", onTouchStart, { capture: true, passive: true, signal })
      node.addEventListener("touchmove", onTouchMove, { capture: true, passive: true, signal })
      node.addEventListener("touchend", onTouchEnd, { capture: true, passive: false, signal })
      node.addEventListener("touchcancel", resetTouch, { capture: true, signal })
      pinFrame = view.requestAnimationFrame(() => {
        pin = snapshot()
      })
      if (capture(activeOf(document))) request(align)
    }

    const onBand = (next: VirtualKeyboard.Band | null): void => {
      band = next
      if (controller !== null && target !== null) request(align)
    }

    const onChange = (next: TrackKeyboardArgs): void => {
      const previous = current
      current = next
      if (next.open !== previous.open || next.modal !== previous.modal || next.popupId !== previous.popupId) start()
    }

    return Effect.acquireRelease(
      Effect.sync(start).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(VirtualKeyboard.watch(node), (next) => Effect.sync(() => onBand(next))))
        ),
        Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
      ),
      () => Effect.sync(stop)
    )
  })
