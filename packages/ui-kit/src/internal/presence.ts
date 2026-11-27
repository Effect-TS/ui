import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { isHTMLElement } from "./dom.ts"
import { raiseAbove } from "./topLayer.ts"
import { frameOf, settling } from "./transition.ts"

// What a portal's presence reports: that it showed, that its first open
// frame rendered, and that an open's or a close's transitions finished.
export interface PresenceMessages<M> {
  readonly showed: () => M
  readonly started: () => M
  readonly finished: (open: boolean) => M
}

let returning = 0

// Whether focus is going back to a trigger, so its focus handler can tell
// that from the user's focus.
export const returningFocus = (): boolean => returning > 0

const returnFocus = (element: HTMLElement): void => {
  returning++
  try {
    element.focus({ preventScroll: true, focusVisible: true } as FocusOptions)
  } finally {
    returning--
  }
}

// A mount for a portal shown while it's open or still closing. As a close
// starts with focus inside, focus goes back to `trigger` when `restore`, and
// the portal is `inert` through its exit.
export const makeTrackPresence = <M>(
  name: string,
  messages: PresenceMessages<M>
) =>
  Mount.makeStream(
    name,
    {
      args: {
        open: Schema.Boolean,
        mounted: Schema.Boolean,
        started: Schema.Boolean,
        holdExit: Schema.Boolean,
        popupId: Schema.String,
        trigger: Schema.String,
        restore: Schema.Boolean
      }
    },
    (node: HTMLElement, args, changes) =>
      Stream.callback<M>((queue) => {
        const document = node.ownerDocument
        const frame = frameOf(document.defaultView)
        const send = (message: M) => {
          Queue.offerUnsafe(queue, message)
        }
        let current = args
        const popup = () => document.getElementById(current.popupId) ?? node
        const opening = () =>
          frame(() => {
            if (current.open && !current.started) {
              frame(() => send(messages.started()))
            }
          })
        const transition = settling(
          node,
          popup,
          frame,
          (open) => send(messages.finished(open))
        )
        const closing = () => {
          const focused = document.activeElement
          if (
            current.restore && isHTMLElement(focused) && node.contains(focused)
          ) {
            const trigger = document.querySelector<HTMLElement>(current.trigger)
            if (trigger === null) focused.blur()
            else returnFocus(trigger)
          }
          node.inert = true
        }
        const onChange = (next: typeof args) => {
          const previous = current
          current = next
          if (previous.open && !next.open) closing()
          if (!previous.open && next.open) {
            node.inert = false
            raiseAbove(node)
            send(messages.showed())
            opening()
          }
          transition.follow(previous, next)
        }
        return Effect.acquireRelease(
          Effect.sync(() => {
            raiseAbove(node)
            node.inert = !current.open
            if (!current.mounted) send(messages.showed())
            if (current.open) opening()
          }).pipe(
            Effect.tap(() =>
              Effect.forkScoped(
                Stream.runForEach(changes, (next) =>
                  Effect.sync(() => onChange(next)))
              )
            )
          ),
          () =>
            Effect.sync(() => {
              transition.cancel()
              node.inert = false
            })
        )
      })
  )
