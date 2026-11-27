/**
 * The elements shown as modals, which document and window listeners report
 * as `modal`. The browser host holds the dialogs it opens with
 * `showModal()`, and `HtmlSubscription.holdModal` holds the rest.
 *
 * @internal
 */
const held = new WeakMap<Document, Set<{ readonly element: Element }>>()

/** @internal */
export const hold = (element: Element): () => void => {
  const document = element.ownerDocument
  let holds = held.get(document)
  if (holds === undefined) held.set(document, holds = new Set())
  const entry = { element }
  holds.add(entry)
  return () => {
    holds.delete(entry)
  }
}

/**
 * Whether a held element is in `document`. One that left it, as when its
 * root is gone without releasing it, doesn't count until it's back.
 *
 * @internal
 */
export const open = (document: Document): boolean => {
  const holds = held.get(document)
  if (holds !== undefined) {
    for (const { element } of holds) if (element.isConnected) return true
  }
  return false
}
