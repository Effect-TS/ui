/**
 * The document head sync the browser hosts share: one per document, not per host. `HtmlHead` loads
 * the full sync, which owns marked tags and the `<html>` / `<body>` attributes. Until it does, the
 * only head entry an app can make is `Head.title`, so only `<title>` is synced, and an app that
 * writes no head carries neither.
 */
import { marker } from "./headAttributes.ts"

/** @internal */
export type HeadSync = (
  document: Document,
  warn: (message: string) => void
) => { readonly sync: (head: never) => void; readonly release: () => void }

/** A document's sync: `restore` puts the shell's values back, if it has synced. */
interface Sync {
  readonly sync: (head: never) => void
  readonly restore: () => void
}

type MakeSync = (document: Document, warn: (message: string) => void) => Sync

let full: MakeSync | undefined

/** @internal */
export const load = (make: MakeSync): void => {
  full = make
}

const titleOnly: MakeSync = (document, warn) => {
  const first = document.querySelector("title")
  const original = first !== null && first.hasAttribute(marker)
    ? ""
    : document.title
  let synced = false
  let owned = false
  const sync = (head: { readonly title: string | undefined }) => {
    const title = head.title
    if (!synced) {
      synced = true
      const at = document.querySelector("title")
      if (
        title !== undefined && at !== null && !at.hasAttribute(marker) &&
        document.querySelector(`title[${marker}]`) !== null
      ) {
        warn(
          "Head: an unmarked <title> comes before the marked one, so the browser shows the shell's"
        )
      }
    }
    if (title !== undefined) {
      owned = true
      if (document.title !== title) document.title = title
    } else if (owned) {
      owned = false
      if (document.title !== original) document.title = original
    }
  }
  return {
    sync: sync as Sync["sync"],
    restore: () => {
      if (synced) sync({ title: undefined })
    }
  }
}

const shared = new WeakMap<Document, Sync & { hosts: number }>()

/**
 * Makes the `head` member of the browser host, and `release` for its `dispose`.
 *
 * **Details**
 *
 * Hosts on one document share one sync, made with the first host's `warn`,
 * so the shell's values are captured once, before any host writes. When
 * the last host on the document is released, the shell's values go back if
 * any host wrote, and the next host captures the shell again. A server's
 * head that no host synced stays as it is.
 *
 * @internal
 */
export const make: HeadSync = (document, warn) => {
  let entry = shared.get(document)
  if (entry === undefined) {
    entry = { ...(full ?? titleOnly)(document, warn), hosts: 0 }
    shared.set(document, entry)
  }
  const current = entry
  current.hosts++
  let released = false
  return {
    sync: current.sync,
    release: () => {
      if (released) return
      released = true
      if (--current.hosts > 0) return
      shared.delete(document)
      current.restore()
    }
  }
}
