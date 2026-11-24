import { marker } from "./headAttributes.ts"

/** @internal */
export type HeadSync = (
  document: Document,
  warn: (message: string) => void
) => { readonly sync: (head: never) => void; readonly release: () => void }

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

/** @internal */
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
