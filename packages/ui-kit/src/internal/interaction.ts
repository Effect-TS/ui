import * as DomSubscription from "@effect/ui/html/DomSubscription"
import type * as Html from "@effect/ui/html/Html"
import type * as Subscription from "@effect/ui/Subscription"
import * as Schema from "effect/Schema"

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })

export type Point = typeof Point.Type

export const pointOf = ({ x, y }: Partial<Html.HoverPayload>): Point | null =>
  x === undefined || y === undefined ? null : { x, y }

export const methodOf = (pointerType: string): "mouse" | "touch" | "pen" | "keyboard" =>
  pointerType === "touch" || pointerType === "pen" ? pointerType : pointerType === "" ? "keyboard" : "mouse"

export const onEscape = <M>(message: M): Subscription.Subscription<M> =>
  DomSubscription.onDocument(
    "keydown",
    ({ composing, defaultPrevented, key }) => key === "Escape" && !composing && !defaultPrevented ? message : undefined,
    { preventDefault: true }
  )

export const onScrollbar = (target: EventTarget | null, event: MouseEvent): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const document = target.ownerDocument
  const style = document.defaultView?.getComputedStyle(target)
  if (style === undefined) return false
  const page = target === document.documentElement || target === document.body
  const scrollsX = (page || /auto|scroll/.test(style.overflowX)) && target.clientWidth > 0 &&
    target.scrollWidth > target.clientWidth
  const scrollsY = (page || /auto|scroll/.test(style.overflowY)) && target.clientHeight > 0 &&
    target.scrollHeight > target.clientHeight
  const onY = scrollsY && (style.direction === "rtl"
    ? event.offsetX <= target.offsetWidth - target.clientWidth
    : event.offsetX > target.clientWidth)
  return onY || (scrollsX && event.offsetY > target.clientHeight)
}
