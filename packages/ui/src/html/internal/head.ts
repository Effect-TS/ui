/**
 * The browser host's head sync: it diffs each folded `HtmlHead.HtmlHead` against the
 * document, owning only marked tags plus `<title>` and `lang` / `dir`. Every host on one
 * document shares one sync, so they share the shell's baseline.
 *
 * The title's sync is here. The rest is `headTags.ts`, which `HtmlHead` loads: an app that uses
 * nothing from `HtmlHead` has no entry but a title, and doesn't ship it.
 */
import type * as Head from "../HtmlHead.ts"
import * as headAttributes from "./headAttributes.ts"
import * as headMerge from "./headMerge.ts"
import type * as headTags from "./headTags.ts"

type Warn = (message: string) => void

let makeTags: typeof headTags.make | undefined

/**
 * Gives every sync its part for tags and attributes. A sync made before then takes it at its next run.
 *
 * @internal
 */
export const load = (make: typeof headTags.make): void => {
  makeTags = make
}

const marker = headAttributes.marker

/** What the server marked for the part that isn't loaded. */
const markedSelector = ["html", "body", "head meta", "head link", "head script"]
  .map((selector) => `${selector}[${marker}]`).join(",")

/** Whether a head holds more than a title. */
const holdsMore = (head: Head.HtmlHead): boolean => {
  for (const part of [head.meta, head.links, head.jsonLd, head.html.class, head.body.class]) {
    if (part.length > 0) return true
  }
  for (const data of [head.html.data, head.body.data]) {
    for (const _ in data) return true
  }
  return head.html.lang !== undefined || head.html.dir !== undefined
}

interface Shared {
  readonly sync: (head: Head.HtmlHead) => void
  /** Puts the shell's values back, if a host has synced. */
  readonly restore: () => void
  hosts: number
}

/** The sync of each document with a live host: one baseline per document, not per host. */
const shared = new WeakMap<Document, Shared>()

/**
 * Makes the `head` member of the DOM host, and `release` for its `dispose`.
 *
 * **Details**
 *
 * Hosts on one document share one sync, made with the first host's `warn`,
 * so the shell's values are captured once, before any host writes. When
 * the last host on the document is released, the shell's values go back if
 * any host wrote, and the next host captures the shell again. A server's
 * head that no host synced stays as it is.
 *
 * Until `HtmlHead` is loaded, only the title is synced. A head that holds more,
 * or a document with tags or attributes the server marked, is left as it is with a warning.
 *
 * @internal
 */
export const make = (
  document: Document,
  warn: Warn
): { readonly sync: (head: Head.HtmlHead) => void; readonly release: () => void } => {
  let entry = shared.get(document)
  if (entry === undefined) {
    entry = { ...makeSync(document, warn), hosts: 0 }
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

const makeSync = (document: Document, warn: Warn): Pick<Shared, "sync" | "restore"> => {
  const titleElement = document.querySelector("title")
  const originalTitle = titleElement !== null && titleElement.hasAttribute(marker) ? "" : document.title
  let titleOwned = false
  let synced = false
  let warned = false

  const checkTitle = (head: Head.HtmlHead) => {
    if (head.title !== undefined) {
      const first = document.querySelector("title")
      if (first !== null && !first.hasAttribute(marker) && document.querySelector(`title[${marker}]`) !== null) {
        warn("Head: an unmarked <title> comes before the marked one, so the browser shows the shell's")
      }
    }
  }

  // Made with the first host when `HtmlHead` is loaded by then, so it captures the shell before any write.
  let tags = makeTags?.(document, warn, checkTitle)

  const sync = (head: Head.HtmlHead) => {
    tags ??= makeTags?.(document, warn, checkTitle)
    const first = !synced
    synced = true
    if (tags === undefined) {
      if (first) checkTitle(head)
      const more = holdsMore(head)
      if (!warned && (more || (first && document.querySelector(markedSelector) !== null))) {
        warned = true
        warn(
          `Head: ${
            more ? "the head holds more than a title" : "the server marked tags or attributes in the document"
          }` +
            ", and the app uses nothing from HtmlHead, which brings their sync, so they are left as they are"
        )
      }
    }

    if (head.title !== undefined) {
      titleOwned = true
      if (document.title !== head.title) document.title = head.title
    } else if (titleOwned) {
      titleOwned = false
      if (document.title !== originalTitle) document.title = originalTitle
    }

    tags?.sync(head)
  }
  return {
    sync,
    restore: () => {
      if (synced) sync(headMerge.empty)
    }
  }
}
