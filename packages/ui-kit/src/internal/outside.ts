import { focusedOf, listenTrees } from "./dom.ts"
import { onScrollbar } from "./interaction.ts"
import { inKept } from "./topLayer.ts"

export interface Outside {
  readonly open: () => boolean
  readonly anyButton?: (() => boolean) | undefined
  readonly inside: (target: Node) => boolean
  readonly pressed: (pointerType: string) => void
  readonly focused?: (() => void) | undefined
  // Focus moved from inside to anywhere else, including <body> and out of
  // the document, which fire no focusin.
  readonly left?: (() => void) | undefined
}

export const listenOutside = (
  node: Element,
  signal: AbortSignal,
  outside: Outside
): void => {
  let touchPress = false
  const onPointerDown = (event: PointerEvent) => {
    touchPress = false
    const target = event.target as Node | null
    if (
      !outside.open() || target === null ||
      (event.button !== 0 && outside.anyButton?.() !== true) ||
      !event.isPrimary || outside.inside(target)
    ) return
    if (inKept(target)) return
    if (event.pointerType === "touch") touchPress = true
    else if (!onScrollbar(target, event)) outside.pressed(event.pointerType)
  }
  const onClick = (event: MouseEvent) => {
    if (!touchPress) return
    touchPress = false
    const target = event.target as Node | null
    if (outside.open() && target !== null && !outside.inside(target)) {
      outside.pressed("touch")
    }
  }
  const focused = outside.focused
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as Node | null
    if (outside.open() && target !== null && !outside.inside(target)) {
      focused?.()
    }
  }
  const captured = { capture: true, signal }
  listenTrees(node, "pointerdown", onPointerDown, captured)
  listenTrees(node, "click", onClick, captured)
  if (focused !== undefined) listenTrees(node, "focusin", onFocusIn, captured)
  const left = outside.left
  if (left === undefined) return
  let settle: ReturnType<typeof setTimeout> | undefined
  const isInside = (target: Node | null) =>
    target !== null && outside.inside(target)
  const onFocusOut = (event: FocusEvent) => {
    if (!isInside(event.target as Node | null)) return
    clearTimeout(settle)
    settle = setTimeout(() => {
      if (outside.open() && !isInside(focusedOf(node))) left()
    }, 0)
  }
  listenTrees(node, "focusout", onFocusOut, captured)
  signal.addEventListener("abort", () => clearTimeout(settle))
}

export const releasedOutside = (
  event: MouseEvent,
  inside: (target: Node) => boolean,
  anchor: Element | null
): boolean => {
  const target = event.target as Node | null
  if (target === null || inside(target)) return false
  if (anchor === null) return true
  const r = anchor.getBoundingClientRect()
  return event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom
}
