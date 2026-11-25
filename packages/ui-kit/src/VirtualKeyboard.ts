/**
 * Tells where the software keyboard leaves the page visible, so content
 * fixed to the bottom of the screen can sit above it.
 *
 * A touch device's keyboard covers the bottom of the screen when a text
 * field takes focus. Browsers report it differently: some shrink the visual
 * viewport and leave the layout viewport, some shrink both, and some shrink
 * the layout viewport only after the visual one. This module reads the
 * viewport's sizes and works out the band of the screen the keyboard leaves
 * visible.
 *
 * It has two layers:
 *
 * - `step` is a pure function from a `Sample` of the viewport's sizes to the
 *   visible `Band`, or `null` while no keyboard is up. It keeps a little
 *   `State` between samples, which it takes and returns. It reads no DOM, so
 *   the detection can be tested without a device.
 * - `watch` is a Stream of the band for a node's document, and
 *   `TrackKeyboard` is a stream mount that writes it on the node.
 *
 * **What the mount writes**
 *
 * On its node, as inline style, `--keyboard-inset`: the height the keyboard
 * covers at the bottom of the layout viewport, in pixels. It is absent while
 * no keyboard is up, and removed when the mount ends, so CSS reads it as
 * `var(--keyboard-inset, 0px)`, for example in a `bottom` or a
 * `padding-bottom`.
 *
 * **How a keyboard is told apart**
 *
 * - Only while a text field has focus: an `<input>` of a type that types
 *   text, a `<textarea>` or an editable element, and not a disabled one.
 * - The visual viewport is more than 60 pixels shorter on screen than the
 *   part of the layout viewport it shows, which a browser's toolbar alone
 *   doesn't do. A pinch-zoom shrinks both alike, so it isn't a keyboard.
 * - On Android, the layout viewport is more than 60 pixels shorter than the
 *   tallest it has been at the current width, for a keyboard that resizes
 *   the page. A change of width, such as a rotation, starts the count again.
 * - Once seen, the keyboard counts as up until the visual viewport's height
 *   on screen changes by more than 60 pixels or focus leaves the text
 *   fields, so a layout viewport that shrinks to the visual one afterwards
 *   doesn't hide it.
 * - While the layout viewport follows the keyboard, as `100svh` does in some
 *   browsers, content fixed to the bottom already sits above it, and the
 *   inset is 0.
 *
 * **Gotchas**
 *
 * - While the page is pinch-zoomed, the band is the part of the layout
 *   viewport on screen above the keyboard, so content fixed to the bottom
 *   moves up into view, even while the layout viewport follows the keyboard.
 * - Without `visualViewport`, the Stream reports `null` once and ends.
 * - While a text field has focus, `watch` keeps a hidden element in
 *   `<body>` to measure `100svh`.
 *
 * **Example** (A keyboard over the bottom of the screen)
 *
 * ```ts import.meta.vitest
 * import { VirtualKeyboard } from "@effect/ui-kit"
 *
 * const closed: VirtualKeyboard.Sample = {
 *   layoutWidth: 400,
 *   layoutHeight: 800,
 *   visualHeight: 800,
 *   visualTop: 0,
 *   scale: 1,
 *   smallViewportHeight: 800,
 *   android: false,
 *   focused: true
 * }
 * const state = VirtualKeyboard.initialState(closed)
 *
 * if (VirtualKeyboard.step(state, closed).band !== null) throw new Error("no keyboard is up yet")
 *
 * const { band } = VirtualKeyboard.step(state, { ...closed, visualHeight: 500 })
 * if (band === null || band.top !== 0 || band.bottom !== 500 || band.inset !== 300) {
 *   throw new Error("the keyboard should cover the bottom 300 pixels")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { activeOf, isHTMLElement } from "./internal/dom.ts"
import { isAndroid } from "./internal/platform.ts"

const threshold = 60

/**
 * The band of the screen the keyboard leaves visible, in viewport
 * coordinates.
 *
 * **Details**
 *
 * - `top`, `bottom`: the band's edges, in pixels from the top of the layout
 *   viewport.
 * - `inset`: the height below `bottom` that the keyboard covers, rounded
 *   up, which the mount writes as `--keyboard-inset`. 0 while the layout
 *   viewport follows the keyboard, unless the page is pinch-zoomed and the
 *   layout viewport's bottom is off screen.
 * - `resizing`: the layout viewport follows the keyboard and hasn't reached
 *   the visual viewport's height yet, so the page is still moving. A scroll
 *   started now may restart when it settles.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Band = Schema.Struct({
  top: Schema.Number,
  bottom: Schema.Number,
  inset: Schema.Number,
  resizing: Schema.Boolean
})

/**
 * The band of the screen the keyboard leaves visible.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Band = typeof Band.Type

/**
 * What `step` reads: the viewport's sizes at one moment, in CSS pixels.
 *
 * **Details**
 *
 * - `layoutWidth`, `layoutHeight`: the layout viewport, the root element's
 *   `clientWidth` and `innerHeight`. WebKit shrinks `innerHeight` to the
 *   visual viewport while the page is pinch-zoomed, so `watch` scales it
 *   back up there.
 * - `visualWidth`, `visualHeight`, `visualTop`, `scale`:
 *   `visualViewport`'s `width`, `height`, `offsetTop` and `scale`.
 *   Without `visualWidth`, `step` takes the visual viewport to be as wide
 *   as the layout viewport, and reports no band while `scale` isn't 1.
 * - `smallViewportHeight`: the height of `100svh`.
 * - `android`: the browser runs on Android.
 * - `focused`: a text field has focus.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Sample {
  readonly layoutWidth: number
  readonly layoutHeight: number
  readonly visualWidth?: number | undefined
  readonly visualHeight: number
  readonly visualTop: number
  readonly scale: number
  readonly smallViewportHeight: number
  readonly android: boolean
  readonly focused: boolean
}

/**
 * What `step` remembers between samples.
 *
 * **Details**
 *
 * - `layoutWidth`: the layout viewport's width the tallest height belongs
 *   to.
 * - `tallestLayoutHeight`: the tallest layout viewport seen at that width,
 *   kept on Android only.
 * - `keyboardHeight`: the visual viewport's height on screen, times
 *   `scale`, when the keyboard was last seen, or `null` while none is.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface State {
  readonly layoutWidth: number
  readonly tallestLayoutHeight: number
  readonly keyboardHeight: number | null
}

/**
 * What `step` returns: the next `State`, and the band, or `null` while no
 * keyboard is up.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Step {
  readonly state: State
  readonly band: Band | null
}

/**
 * The `State` to start from, taken from the layout viewport's size before
 * any keyboard is up.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const initialState = (
  layout: { readonly layoutWidth: number; readonly layoutHeight: number }
): State => ({
  layoutWidth: layout.layoutWidth,
  tallestLayoutHeight: layout.layoutHeight,
  keyboardHeight: null
})

/**
 * Works out the band the keyboard leaves visible from one `Sample`.
 *
 * **Details**
 *
 * Pass the returned `state` to the next call. The module's JSDoc lists how a
 * keyboard is told apart from a resize.
 *
 * @stability experimental
 * @category detecting
 * @since 0.1.0
 */
export const step = (state: State, sample: Sample): Step => {
  const { layoutHeight, scale, visualHeight } = sample
  // Without the visual width a zoom can't be told from a wide layout.
  if (sample.visualWidth === undefined && scale !== 1) {
    return { state, band: null }
  }
  const visualWidth = sample.visualWidth ?? sample.layoutWidth
  const zoomed = sample.layoutWidth - visualWidth >= 1
  // The share of the layout viewport the visual one shows: all of it, unless
  // pinch-zoomed in. A keyboard leaves the width alone.
  const fit = Math.min(1, visualWidth / sample.layoutWidth)
  // Heights on screen, so a zoom changes none of the comparisons below.
  const layout = layoutHeight * fit * scale
  const visual = visualHeight * scale
  const small = sample.smallViewportHeight * fit * scale
  let layoutWidth = state.layoutWidth
  let tallest = state.tallestLayoutHeight
  let shrunk = false
  if (sample.android) {
    if (sample.layoutWidth !== layoutWidth) {
      layoutWidth = sample.layoutWidth
      tallest = layoutHeight
    }
    tallest = Math.max(tallest, layoutHeight)
    shrunk = tallest - layoutHeight > threshold
  }
  const next = (keyboardHeight: number | null): State => ({
    layoutWidth,
    tallestLayoutHeight: tallest,
    keyboardHeight
  })
  if (!sample.focused) return { state: next(null), band: null }
  let keyboardHeight = state.keyboardHeight
  if (layout - visual > threshold || shrunk) {
    keyboardHeight = visual
  } else if (
    keyboardHeight === null ||
    Math.abs(visual - keyboardHeight) > threshold
  ) {
    return { state: next(null), band: null }
  }
  const follows = small - visual <= threshold
  const top = Math.max(0, sample.visualTop)
  const bottom = follows && !zoomed
    ? layoutHeight
    : Math.min(layoutHeight, top + visualHeight)
  return {
    state: next(keyboardHeight),
    band: {
      top,
      bottom,
      inset: Math.max(0, Math.ceil(layoutHeight - bottom)),
      resizing: follows && Math.abs(layout - visual) >= 1
    }
  }
}

const textTypes = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url"
])

const opensKeyboard = (element: HTMLElement): boolean => {
  if (element.isContentEditable) return true
  const view = element.ownerDocument.defaultView!
  if (
    element instanceof view.HTMLTextAreaElement ||
    (element instanceof view.HTMLInputElement && textTypes.has(element.type))
  ) return !element.matches(":disabled")
  return false
}

const editingHost = (element: HTMLElement): HTMLElement => {
  let host = element
  while (host.parentElement?.isContentEditable) host = host.parentElement
  return host
}

/**
 * The text field a target stands for: the target itself when it is a text
 * field, the editable element it sits in, or the text field of the
 * `<label>` it is in. `null` for anything else, a disabled field included.
 *
 * **Details**
 *
 * A text field is an `<input>` of type `text`, `search`, `email`, `url`,
 * `tel`, `password` or `number`, a `<textarea>`, or an editable element.
 * Focusing one opens the software keyboard.
 *
 * @stability experimental
 * @category detecting
 * @since 0.1.0
 */
export const textFieldOf = (target: EventTarget | null): HTMLElement | null => {
  if (!isHTMLElement(target)) return null
  if (opensKeyboard(target)) {
    return target.isContentEditable
      ? editingHost(target)
      : target
  }
  const control = target.closest("label")?.control ?? null
  return isHTMLElement(control) && opensKeyboard(control) ? control : null
}

const sameBand = Schema.toEquivalence(Schema.NullOr(Band))

/**
 * A Stream of the band the keyboard leaves visible in a node's document:
 * the band when it starts, then each time it changes, and `null` while no
 * keyboard is up.
 *
 * **Details**
 *
 * It samples the viewport when `visualViewport` resizes or scrolls, when
 * the window resizes, and on the frame after focus moves. A text field
 * anywhere in the document counts.
 *
 * It writes nothing. Pass it to `Mount.makeStream` to build a mount that
 * does more with the band than `TrackKeyboard`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const watch = (node: Node): Stream.Stream<Band | null> =>
  Stream.suspend(() => {
    const document = node.ownerDocument ?? (node as Document)
    const view = document.defaultView
    const viewport = view?.visualViewport ?? null
    if (view === null || viewport === null) return Stream.succeed(null)
    return Stream.callback<Band | null>((queue) => {
      const android = isAndroid(view)
      const layout = () => {
        const { innerHeight, innerWidth } = view
        const width = document.documentElement.clientWidth || innerWidth
        return {
          layoutWidth: width,
          // Under pinch-zoom, WebKit shrinks innerWidth and innerHeight to
          // the visual viewport; the root element keeps the layout width.
          layoutHeight: innerHeight * Math.max(1, width / innerWidth)
        }
      }
      let state = initialState(layout())
      let probe: HTMLElement | null = null
      let frame = -1

      const smallViewportHeight = (): number => {
        if (probe === null && document.body !== null) {
          probe = document.createElement("div")
          probe.style.cssText =
            "position:fixed;top:0;height:100svh;visibility:hidden;pointer-events:none"
          document.body.appendChild(probe)
        }
        return probe?.offsetHeight ?? view.innerHeight
      }

      const sample = (): void => {
        const focused = textFieldOf(activeOf(document)) !== null
        const next = step(state, {
          ...layout(),
          visualWidth: viewport.width,
          visualHeight: viewport.height,
          visualTop: viewport.offsetTop,
          scale: viewport.scale,
          smallViewportHeight: focused
            ? smallViewportHeight()
            : view.innerHeight,
          android,
          focused
        })
        state = next.state
        Queue.offerUnsafe(queue, next.band)
      }

      const later = (): void => {
        view.cancelAnimationFrame(frame)
        frame = view.requestAnimationFrame(sample)
      }

      const controller = new AbortController()
      const { signal } = controller
      return Effect.acquireRelease(
        Effect.sync(() => {
          viewport.addEventListener("resize", sample, { signal })
          viewport.addEventListener("scroll", sample, { signal })
          view.addEventListener("resize", sample, { signal })
          document.addEventListener("focusin", later, { capture: true, signal })
          document.addEventListener("focusout", later, {
            capture: true,
            signal
          })
          sample()
        }),
        () =>
          Effect.sync(() => {
            controller.abort()
            view.cancelAnimationFrame(frame)
            probe?.remove()
          })
      )
    }).pipe(Stream.changesWith(sameBand))
  })

const insetProperty = "--keyboard-inset"

/**
 * A stream mount that writes `--keyboard-inset` on its node while the
 * software keyboard is up, and reports each band `watch` reports.
 *
 * **Details**
 *
 * The module's JSDoc says what it writes. Map the bands to a message with
 * `Mount.map`, or to `Component.noop` when only the CSS variable is needed:
 * `h.div.onMount(VirtualKeyboard.TrackKeyboard().pipe(Mount.map(() => Component.noop)))`.
 *
 * A `Scene` has no viewport, so send a band there with
 * `mounted(VirtualKeyboard.TrackKeyboard, band)`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const TrackKeyboard = Mount.makeStream(
  "TrackKeyboard",
  { args: {} },
  (node: HTMLElement) =>
    watch(node).pipe(
      Stream.tap((band) =>
        Effect.sync(() => {
          if (band === null) node.style.removeProperty(insetProperty)
          else node.style.setProperty(insetProperty, band.inset + "px")
        })
      ),
      Stream.ensuring(
        Effect.sync(() => node.style.removeProperty(insetProperty))
      )
    )
)
