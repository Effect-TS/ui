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
    if (element.contains(shown) || shown.contains(element) || !showing(element)) continue
    // Showing it again puts it last in the top layer, above `shown`. In one
    // task it keeps its animations and focus.
    element.hidePopover()
    element.showPopover()
  }
}
