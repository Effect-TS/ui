import { elementOf } from "./dom.ts"
import { inSafeArea, type Point } from "./safeArea.ts"

// Watches whether the pointer is in a popup's hover area: on `node`, on an
// element that matches `triggers`, or in the triangle between the point
// where it left a trigger and `node`. A fast move reports the leave where
// the pointer already is, so that point is clamped to the trigger's box.
// `report` hears `true` when the pointer leaves the area and `false` when
// it comes back, only on a change.
// The listeners stay until `signal` aborts.
export const watchHoverArea = (
  node: HTMLElement,
  signal: AbortSignal,
  triggers: () => string,
  report: (away: boolean) => void
): void => {
  const document = node.ownerDocument
  let from: Point | null = null
  let away: boolean | null = null
  const inside = (target: EventTarget | null) => {
    const element = elementOf(target)
    return element !== null &&
      (node.contains(element) || element.closest(triggers()) !== null)
  }
  const change = (next: boolean) => {
    if (away === next) return
    away = next
    report(next)
  }
  const options = { capture: true, passive: true, signal }
  document.addEventListener("mouseleave", (event) => {
    const trigger = elementOf(event.target)
    if (trigger?.matches(triggers()) !== true) return
    const box = trigger.getBoundingClientRect()
    from = {
      x: Math.min(Math.max(event.clientX, box.left), box.right),
      y: Math.min(Math.max(event.clientY, box.top), box.bottom)
    }
  }, options)
  document.addEventListener("mousemove", (event) => {
    if (inside(event.target)) return change(false)
    const point = { x: event.clientX, y: event.clientY }
    if (
      from !== null && inSafeArea(point, from, node.getBoundingClientRect())
    ) {
      return change(false)
    }
    from = null
    change(true)
  }, options)
  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget !== null) return
    from = null
    change(true)
  }, options)
}
