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

export const portalBox = [
  "position:fixed",
  "inset:0",
  "width:0",
  "height:0",
  "max-width:none",
  "max-height:none",
  "margin:0",
  "padding:0",
  "border:0",
  "overflow:visible",
  "background:transparent",
  "color:inherit"
].join(";")

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
    : builder.attr("hidden", shown ? undefined : "")

// The box of a portal drawn in place: no box of its own, and no containing
// block, so what it holds is laid out and positioned against the element
// the view put it in. A `<dialog>`'s own `position: absolute` and its
// `display` while closed stay out of it.
export const inPlaceBox = [
  "position:static",
  "inset:auto",
  "width:auto",
  "height:auto",
  "max-width:none",
  "max-height:none",
  "margin:0",
  "padding:0",
  "border:0",
  "overflow:visible",
  "background:transparent",
  "color:inherit"
].join(";")
