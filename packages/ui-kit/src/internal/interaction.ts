export const methodOf = (pointerType: string): "mouse" | "touch" | "pen" | "keyboard" =>
  pointerType === "touch" || pointerType === "pen" ? pointerType : pointerType === "" ? "keyboard" : "mouse"

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
