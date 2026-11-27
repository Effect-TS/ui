/**
 * The elements shown as modals, which document and window listeners report
 * as `modal`. The browser host holds the dialogs it opens with
 * `showModal()`, and `HtmlSubscription.holdModal` holds the rest.
 *
 * @internal
 */
const held = new Set<{ readonly element: Element }>()

/** @internal */
export const hold = (element: Element): () => void => {
  const entry = { element }
  held.add(entry)
  return () => {
    held.delete(entry)
  }
}

/**
 * Whether a held element is in `document`. One that left it, as when its
 * root is gone without releasing it, no longer counts.
 *
 * @internal
 */
export const open = (document: Document): boolean => {
  for (const { element } of held) {
    if (element.isConnected && element.ownerDocument === document) return true
  }
  return false
}
