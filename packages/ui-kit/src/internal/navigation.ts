import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { type Attributed, attrSelector, flag } from "./attributes.ts"
import { isRtl } from "./direction.ts"

// The attribute a list tells its links and triggers by, with the list's scope.
export const itemAttribute = "data-navigation-item"

export const ArrowKeys = Schema.Struct({
  scope: Schema.String,
  vertical: Schema.Boolean,
  // The nearest `DirectionProvider`'s direction, which wins over CSS.
  rtl: Schema.NullOr(Schema.Boolean)
})

export type ArrowKeys = typeof ArrowKeys.Type

export const linkAttrs = <B extends Attributed<B>>(
  builder: B,
  scope: string,
  active: boolean
): B =>
  builder.attrs({
    "aria-current": active ? "page" : undefined,
    "data-active": flag(active),
    [itemAttribute]: scope
  })

const modified = (event: KeyboardEvent): boolean =>
  event.defaultPrevented || event.shiftKey || event.ctrlKey || event.altKey ||
  event.metaKey

// Moves focus to the next item of the scope that takes it, and cancels the
// key's default only when focus moved.
export const moveFocus = (
  list: HTMLElement,
  event: KeyboardEvent,
  keys: ArrowKeys
): void => {
  if (modified(event)) return
  const [backward, forward] = keys.vertical
    ? ["ArrowUp", "ArrowDown"]
    : ["ArrowLeft", "ArrowRight"]
  if (event.key !== backward && event.key !== forward) return
  const rtl = !keys.vertical && (keys.rtl ?? isRtl(list))
  const items = Array.from(
    list.querySelectorAll<HTMLElement>(attrSelector(itemAttribute, keys.scope))
  )
  const from = items.findIndex((item) =>
    item.contains(event.target as Node | null)
  )
  if (from < 0) return
  const ahead = (event.key === forward) !== rtl
    ? items.slice(from + 1)
    : items.slice(0, from).reverse()
  const root = list.getRootNode() as Document | ShadowRoot
  const focused = root.activeElement
  const moved = ahead.some((item) => {
    if (item.getAttribute("aria-disabled") === "true") return false
    item.focus()
    return root.activeElement !== focused
  })
  if (moved) event.preventDefault()
}

// The key that opens a trigger's panel: Down in a horizontal menu, and in a
// vertical one Right, or Left when it is right-to-left.
export const opensPanel = (
  list: HTMLElement,
  event: KeyboardEvent,
  keys: ArrowKeys
): boolean =>
  !modified(event) &&
  (keys.vertical
    ? (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      (event.key === "ArrowLeft") === (keys.rtl ?? isRtl(list))
    : event.key === "ArrowDown")

// A list's arrow keys, and what `onKey` makes of a key they leave.
export const makeTrackArrowKeys = <M = never>(
  name: string,
  onKey?: (
    list: HTMLElement,
    event: KeyboardEvent,
    keys: ArrowKeys
  ) => M | undefined
) =>
  Mount.makeStream(
    name,
    { args: ArrowKeys },
    (node: HTMLElement, args, changes) =>
      Stream.callback<M>((queue) =>
        Effect.gen(function*() {
          let current = args
          const onKeyDown = (event: KeyboardEvent) => {
            moveFocus(node, event, current)
            const message = onKey?.(node, event, current)
            if (message !== undefined) Queue.offerUnsafe(queue, message)
          }
          yield* Effect.acquireRelease(
            Effect.sync(() => node.addEventListener("keydown", onKeyDown)),
            () =>
              Effect.sync(() => node.removeEventListener("keydown", onKeyDown))
          )
          yield* Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              current = next
            })).pipe(Effect.forkScoped)
        })
      )
  )
