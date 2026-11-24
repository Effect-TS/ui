import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag } from "./attributes.ts"
import { override } from "./dom.ts"
import { activationDirection } from "./safeArea.ts"
import { frameOf, whenFinished } from "./transition.ts"

export const ViewportChange = Schema.Union([
  Schema.TaggedStruct("Started", { direction: Schema.NullOr(Schema.String) }),
  Schema.TaggedStruct("Advanced", {}),
  Schema.TaggedStruct("Ended", {})
])

export type ViewportChange = typeof ViewportChange.Type

export const ViewportTransition = Schema.Struct({
  direction: Schema.NullOr(Schema.String),
  entered: Schema.Boolean
})

export type ViewportTransition = typeof ViewportTransition.Type

export const stepViewport = <
  M extends { readonly transition: ViewportTransition | null }
>(
  model: M,
  change: ViewportChange,
  open: boolean
): M =>
  change._tag === "Started"
    ? open
      ? {
        ...model,
        transition: { direction: change.direction, entered: false }
      }
      : model
    : change._tag === "Advanced"
    ? model.transition === null
      ? model
      : { ...model, transition: { ...model.transition, entered: true } }
    : { ...model, transition: null }

interface Size {
  readonly width: number
  readonly height: number
}

const sizeOf = (element: HTMLElement): Size => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  const width = parseFloat(style?.width ?? "")
  const height = parseFloat(style?.height ?? "")
  return {
    width: Number.isFinite(width) ? width : element.offsetWidth,
    height: Number.isFinite(height) ? height : element.offsetHeight
  }
}

const sized = (
  element: HTMLElement,
  prefix: string,
  size: Size | string
): void => {
  element.style.setProperty(
    prefix + "-width",
    typeof size === "string" ? size : size.width + "px"
  )
  element.style.setProperty(
    prefix + "-height",
    typeof size === "string" ? size : size.height + "px"
  )
}

const unsized = (element: HTMLElement | null, prefix: string): void => {
  element?.style.removeProperty(prefix + "-width")
  element?.style.removeProperty(prefix + "-height")
}

const directionOf = (from: Element | null, to: Element | null): string | null =>
  from === null || to === null
    ? null
    : activationDirection(
      from.getBoundingClientRect(),
      to.getBoundingClientRect()
    )

const containerOf = (
  viewport: HTMLElement,
  name: string
): HTMLElement | null => {
  for (const child of viewport.children) {
    if (child.hasAttribute(name)) return child as HTMLElement
  }
  return null
}

const container = new Html.Element<never>("div")
const previousContainer = container.key("previous").attrs({
  "data-previous": "",
  inert: "",
  style: "position:absolute"
})
const previousNode = View.toNode(previousContainer)
const endingNode = View.toNode(previousContainer.attr("data-ending-style", ""))

export const viewportContent = <Msg, R>(
  node: View.ElementBuilder<Msg, R, any, any>,
  key: string,
  transition: ViewportTransition | null
): View.Element<Msg, R> => {
  const built = View.build(node, [])
  const current = {
    ...View.build(
      container
        .key("current:" + key)
        .attrs({
          "data-current": "",
          "data-starting-style": flag(
            transition !== null && !transition.entered
          )
        }),
      []
    ),
    children: built.children
  }
  return {
    ...built,
    children: transition === null
      ? [current]
      : [transition.entered ? endingNode : previousNode, current]
  }
}

export const TrackViewport = Mount.makeStream(
  "TrackViewport",
  {
    args: {
      open: Schema.Boolean,
      trigger: Schema.String,
      side: Schema.String,
      positionerId: Schema.String,
      transitioning: Schema.Boolean
    }
  },
  (node: HTMLElement, args, changes) =>
    Stream.callback<ViewportChange>((queue) => {
      const document = node.ownerDocument
      const frame = frameOf(document.defaultView)
      const send = (change: ViewportChange) => {
        Queue.offerUnsafe(queue, change)
      }
      let current = args
      let content = containerOf(node, "data-current")
      let outgoing: HTMLElement | null = null
      let committed: Size | null = null
      let outgoingSize: Size | null = null
      let anchored = (): void => {}
      let resizing = 0
      let transition = 0
      let released = false

      const positionerOf = () => document.getElementById(current.positionerId)
      const popupOf = (positioner: HTMLElement): HTMLElement | null => {
        let element: HTMLElement | null = node
        while (element !== null && element.parentElement !== positioner) {
          element = element.parentElement
        }
        return element
      }

      const anchoring = (popup: HTMLElement): () => void => {
        const rtl =
          document.defaultView?.getComputedStyle(popup).direction === "rtl"
        const top = current.side === "top"
        const left = current.side === "left" ||
          current.side === (rtl ? "inline-end" : "inline-start")
        if (!top && !left) return () => {}
        return override(popup, {
          position: "absolute",
          [top ? "bottom" : "top"]: "0",
          [left ? "right" : "left"]: "0"
        })
      }

      const resize = (): void => {
        const positioner = positionerOf()
        const popup = positioner === null ? null : popupOf(positioner)
        if (positioner === null || popup === null) return
        const mine = ++resizing
        anchored()
        anchored = anchoring(popup)
        sized(popup, "--popup", "auto")
        const previous = containerOf(node, "data-previous")
        const restores = [
          override(popup, {
            position: "static",
            transform: "none",
            scale: "1"
          }),
          override(positioner, {
            "--available-width": "max-content",
            "--available-height": "max-content"
          }),
          ...(content === null
            ? []
            : [override(content, { animation: "none", transition: "none" })]),
          ...(previous === null
            ? []
            : [override(previous, { display: "none" })])
        ]
        sized(positioner, "--positioner", "max-content")
        const before = committed
        const next = sizeOf(popup)
        committed = next
        if (before !== null) sized(popup, "--popup", before)
        restores.reverse().forEach((restore) => restore())
        sized(positioner, "--positioner", next)
        if (before === null) return
        outgoingSize = before
        const live = () => mine === resizing && !released
        frame(() => {
          if (!live()) return
          sized(popup, "--popup", next)
          whenFinished(
            () => [popup],
            frame,
            live,
            () => sized(popup, "--popup", "auto")
          )
        })
      }

      const fill = (): void => {
        const previous = containerOf(node, "data-previous")
        if (previous === null || outgoing === null) return
        previous.replaceChildren(...outgoing.childNodes)
        if (outgoingSize !== null) sized(previous, "--popup", outgoingSize)
        outgoing = null
        // The new content's style was computed when it was measured, so reaching the starting style would
        // itself transition. This computes it with no transition, for the frame below to transition out of.
        const restore = content === null
          ? undefined
          : override(content, { transition: "none" })
        void node.offsetWidth
        restore?.()
        const mine = ++transition
        const live = () => mine === transition && !released
        const moving = [content, previous]
        frame(() => {
          if (!live()) return
          send({ _tag: "Advanced" })
          frame(() =>
            whenFinished(
              () => moving,
              frame,
              live,
              () => send({ _tag: "Ended" })
            )
          )
        })
      }

      const onChange = (next: typeof args): void => {
        const previous = current
        current = next
        const leaving = content
        content = containerOf(node, "data-current")
        if (!next.open) {
          outgoing = null
          transition++
          if (previous.transitioning) send({ _tag: "Ended" })
          return
        }
        const switched = previous.open && previous.trigger !== next.trigger &&
          leaving !== content
        if (switched) outgoing = leaving
        if (switched || previous.side !== next.side) resize()
        if (switched) {
          send({
            _tag: "Started",
            direction: directionOf(
              document.querySelector(previous.trigger),
              document.querySelector(next.trigger)
            )
          })
        } else if (next.transitioning) fill()
      }

      return Effect.acquireRelease(
        Effect.sync(resize).pipe(
          Effect.tap(() =>
            Effect.forkScoped(
              Stream.runForEach(changes, (next) =>
                Effect.sync(() => onChange(next)))
            )
          )
        ),
        () =>
          Effect.sync(() => {
            released = true
            anchored()
            const positioner = positionerOf()
            unsized(positioner, "--positioner")
            unsized(positioner === null ? null : popupOf(positioner), "--popup")
          })
      )
    })
)
