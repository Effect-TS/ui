import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { isElement } from "./dom.ts"

type Provider = { readonly direction: string } | undefined

export interface Directed {
  readonly reads: { readonly provider?: Provider }
}

export const isRtl = (node: Element): boolean =>
  node.ownerDocument.defaultView?.getComputedStyle(node).direction === "rtl"

export const provided = (provider: Provider): boolean | null =>
  provider === undefined ? null : provider.direction === "rtl"

// The nearest `DirectionProvider` takes precedence over CSS `direction`.
export const rightToLeft = (provider: Provider, css: boolean): boolean =>
  provided(provider) ?? css

// One observer per document or shadow root for every watched element.
const watchers = new WeakMap<
  Node,
  {
    readonly observer: MutationObserver
    readonly reads: Map<Element, () => void>
  }
>()

const above = (node: Node): Node | null =>
  node.parentNode ?? (node as Partial<ShadowRoot>).host ?? null

const observeIn = (
  root: Node,
  Observer: typeof MutationObserver,
  node: Element,
  read: () => void,
  signal: AbortSignal
) => {
  let entry = watchers.get(root)
  if (entry === undefined) {
    const reads = new Map<Element, () => void>()
    // Every inline style written in the root lands here, so each
    // element walks up to the changed nodes instead of testing every record.
    const observer = new Observer((records) => {
      const changed = new Set<Node>()
      for (const record of records) changed.add(record.target)
      for (const [element, read] of reads) {
        for (let at: Node | null = element; at !== null; at = above(at)) {
          if (changed.has(at)) {
            read()
            break
          }
        }
      }
    })
    observer.observe(root, {
      subtree: true,
      attributeFilter: ["dir", "style", "class"]
    })
    entry = { observer, reads }
    watchers.set(root, entry)
  }
  const { observer, reads } = entry
  reads.set(node, read)
  signal.addEventListener("abort", () => {
    reads.delete(node)
    if (reads.size === 0) {
      observer.disconnect()
      watchers.delete(root)
    }
  })
}

// Watches the element's root and, through each shadow host, the roots
// above it.
const observe = (node: Element, read: () => void, signal: AbortSignal) => {
  const Observer = node.ownerDocument.defaultView?.MutationObserver
  if (Observer === undefined) return
  let root: Node = node.getRootNode()
  while (root.nodeType === 11 || root.nodeType === 9) {
    observeIn(root, Observer, node, read, signal)
    const host = (root as Partial<ShadowRoot>).host
    if (host === undefined) break
    root = host.getRootNode()
  }
}

// Sends the element's CSS `direction`, `true` for right-to-left, on mount
// and whenever it changes: when `dir`, `style` or
// `class` changes on it or above it, and when focus enters, for a change
// a stylesheet alone made. Returns the read, for a pointer press to send
// it before its own message.
export const watchDirection = (
  node: Element,
  send: (rtl: boolean) => void,
  signal: AbortSignal
): () => void => {
  // Sent even when left-to-right, so a remount replaces an earlier reading.
  let rtl = isRtl(node)
  send(rtl)
  const read = () => {
    const next = isRtl(node)
    if (next === rtl) return
    rtl = next
    send(rtl)
  }
  observe(node, read, signal)
  node.addEventListener("focusin", read, { signal })
  return read
}

export const watchDirectionScoped = (
  node: Element,
  send: (rtl: boolean) => void
) =>
  Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort())
  ).pipe(
    Effect.map((controller) => watchDirection(node, send, controller.signal))
  )

export const TrackDirection = Mount.makeStream(
  "TrackDirection",
  { args: {} },
  (node: unknown) =>
    Stream.callback<boolean>((queue) =>
      isElement(node)
        ? watchDirectionScoped(node, (rtl) => Queue.offerUnsafe(queue, rtl))
        : Effect.void
    )
)
