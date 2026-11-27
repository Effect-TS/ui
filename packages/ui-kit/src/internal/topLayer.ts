import { flag } from "./attributes.ts"

const kept = new Set<HTMLElement>()

const showing = (element: HTMLElement): boolean => {
  try {
    return element.matches(":popover-open")
  } catch {
    return false
  }
}

export const keepOnTop = (element: HTMLElement): () => void => {
  kept.add(element)
  return () => {
    kept.delete(element)
  }
}

export const inKept = (target: Node): boolean => {
  for (const element of kept) if (element.contains(target)) return true
  return false
}

export const raiseAbove = (shown: Element): void => {
  // A popup drawn in place isn't in the top layer.
  if (!shown.hasAttribute("popover")) return
  for (const element of kept) {
    if (
      element.contains(shown) || shown.contains(element) || !showing(element)
    ) continue
    // Showing it again puts it last in the top layer, above `shown`. In one
    // task it keeps its animations and focus.
    element.hidePopover()
    element.showPopover()
  }
}

// A view transition can delay showing the portal until after its mount starts.
// Raise kept elements only after the portal enters the top layer.
export const raiseAboveShown = (shown: Element, signal: AbortSignal): void => {
  if (!shown.hasAttribute("popover")) return
  if (showing(shown as HTMLElement)) return raiseAbove(shown)
  const opens = (event: Event) => {
    if ((event as ToggleEvent).newState !== "open") return
    shown.removeEventListener("beforetoggle", opens)
    queueMicrotask(() => raiseAbove(shown))
  }
  shown.addEventListener("beforetoggle", opens, { signal })
}

const boxReset =
  "max-width:none;max-height:none;margin:0;padding:0;border:0;overflow:visible;background:transparent;color:inherit"

export const portalBox = "position:fixed;inset:0;width:0;height:0;" + boxReset

export const atDocumentOrigin = "position:absolute;inset:0 auto auto 0"

// A popup in the top layer is a manual popover. One drawn in place, with
// `topLayer: false`, is an ordinary element, `hidden` while it doesn't show.
export const layered = <
  B extends {
    readonly attr: (name: string, value: string | undefined) => B
    readonly popover: (mode: "manual", open: boolean) => B
  }
>(builder: B, topLayer: boolean, shown: boolean): B =>
  topLayer
    ? builder.popover("manual", shown)
    : builder.attr("hidden", flag(!shown))

// The box of a portal drawn in place: no box of its own, and no containing
// block, so what it holds is laid out and positioned against the element
// the view put it in. A `<dialog>`'s own `position: absolute` and its
// `display` while closed stay out of it.
export const inPlaceBox = "position:static;inset:auto;width:auto;height:auto;" +
  boxReset

// The box of a positioned popup's portal: in place, or in the top layer, at
// the document's origin for `positionMethod: "absolute"`.
export const portalStyle = (
  topLayer: boolean,
  positionMethod: string | undefined
): string =>
  !topLayer
    ? inPlaceBox
    : positionMethod === "absolute"
    ? portalBox + ";" + atDocumentOrigin
    : portalBox
