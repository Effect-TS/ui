import type * as Html from "@effect/ui/html/Html"
import * as HtmlSubscription from "@effect/ui/html/HtmlSubscription"
import type * as Subscription from "@effect/ui/Subscription"
import * as Schema from "effect/Schema"
import { isHTMLElement } from "./dom.ts"

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })

export type Point = typeof Point.Type

export const pointOf = ({ x, y }: Partial<Html.HoverPayload>): Point | null =>
  x === undefined || y === undefined ? null : { x, y }

export const methodOf = (
  pointerType: string
): "mouse" | "touch" | "pen" | "keyboard" =>
  pointerType === "touch" || pointerType === "pen"
    ? pointerType
    : pointerType === ""
    ? "keyboard"
    : "mouse"

export const onEscape = <M>(message: M): Subscription.Subscription<M> =>
  HtmlSubscription.shortcuts([{
    key: "Escape",
    message,
    whileTyping: true,
    repeat: true
  }])

/**
 * Tracks input-method composition until `signal` aborts. Treats keyCode 229
 * and keydowns within 20 ms of compositionend as composing too, covering
 * browsers that clear isComposing before the final keydown.
 */
export const trackComposing = (
  document: Document,
  signal: AbortSignal
): (event: KeyboardEvent) => boolean => {
  let ended = Number.NEGATIVE_INFINITY
  document.addEventListener("compositionend", (event) => {
    ended = event.timeStamp
  }, { capture: true, signal })
  return (event) =>
    event.isComposing || event.keyCode === 229 ||
    event.timeStamp - ended < 20
}

export const onScrollbar = (
  target: EventTarget | null,
  event: MouseEvent
): boolean => {
  if (!isHTMLElement(target)) return false
  const document = target.ownerDocument
  const style = document.defaultView?.getComputedStyle(target)
  if (style === undefined) return false
  const page = target === document.documentElement || target === document.body
  const scrollsX = (page || /auto|scroll/.test(style.overflowX)) &&
    target.clientWidth > 0 &&
    target.scrollWidth > target.clientWidth
  const scrollsY = (page || /auto|scroll/.test(style.overflowY)) &&
    target.clientHeight > 0 &&
    target.scrollHeight > target.clientHeight
  const onY = scrollsY && (style.direction === "rtl"
    ? event.offsetX <= target.offsetWidth - target.clientWidth
    : event.offsetX > target.clientWidth)
  return onY || (scrollsX && event.offsetY > target.clientHeight)
}

// Wait briefly after pointerup: the browser may dispatch a click later,
// but sends no event to confirm that no click will follow.
export const onPressClick = (
  document: Document,
  press: PointerEvent,
  clicked: (click: MouseEvent, end: () => void) => void,
  ended?: () => void
): void => {
  const done = new AbortController()
  const options = { capture: true, signal: done.signal }
  const end = () => {
    done.abort()
    ended?.()
  }
  const own = (next: PointerEvent) => next.pointerId === press.pointerId
  document.addEventListener("click", (click) => clicked(click, end), options)
  document.addEventListener(
    "pointerdown",
    (next) => next !== press && end(),
    options
  )
  document.addEventListener(
    "pointercancel",
    (next) => own(next) && end(),
    options
  )
  document.addEventListener("pointerup", (next) => {
    if (own(next)) setTimeout(end, 400)
  }, options)
}
