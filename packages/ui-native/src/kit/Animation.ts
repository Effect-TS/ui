/**
 * Animates `opacity` and `transform` on React Native's native driver, so
 * frames run on the UI thread with no JS in the loop.
 *
 * A view states what a style should be, and the driver gets it there:
 *
 * - A number is a target. When a render changes it, the driver animates
 *   from wherever the value is, with the element's transition.
 * - An expression follows a native event: `scroll` reads a scroll view's
 *   offset, and `interpolate`, `add`, `multiply` and `diffClamp` derive
 *   from it.
 *
 * `stickyHeaders` docks children of a scroll view as it scrolls past them,
 * as React Native's `stickyHeaderIndices` does.
 *
 * Nothing about an animation is kept in the Model. The `animationEnd` event
 * fires when every target of the element has been reached, so `update` can
 * pick the next one.
 *
 * Only `opacity` and `transform` are animated: React Native keeps the
 * driver's values for those two when a later commit changes the view's
 * other props. The element's `style` must not set them.
 *
 * Apps that don't import this module bundle none of it.
 *
 * **Example** (A sticky header, and a panel that fades in)
 *
 * ```ts
 * import { Animation } from "@effect/ui-native/kit"
 * import { pipe } from "effect/Function"
 *
 * // A header that scrolls away with the list, then stops.
 * const list = h.id("list")
 * h.view(
 *   pipe(
 *     h.view.style({ height: 80 }),
 *     Animation.style({
 *       transform: [{
 *         translateY: Animation.interpolate(
 *           Animation.scroll(list, "y"),
 *           [0, 80],
 *           [0, -80],
 *           "clamp"
 *         )
 *       }]
 *     })
 *   ),
 *   pipe(h.scroll, Animation.source(list)).children(rows)
 * )
 *
 * // A panel that fades in when it mounts, and out when `open` turns false.
 * pipe(
 *   h.view,
 *   Animation.style({ opacity: model.open ? 1 : 0 }, Animation.spring(), {
 *     opacity: 0
 *   })
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as View from "@effect/ui/View"
import { dual } from "effect/Function"
import RCTDeviceEventEmitter from "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter"
import { get } from "react-native/Libraries/TurboModule/TurboModuleRegistry"
import { commits, precommits, props } from "../internal/kinds.ts"
import { container, mounted, rootOf, surface } from "../internal/node.ts"
import { rectOf } from "../internal/touch.ts"
import type * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

/**
 * A transform the driver can animate.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TransformKey =
  | "translateX"
  | "translateY"
  | "scale"
  | "scaleX"
  | "scaleY"

/**
 * A target, or an expression the driver evaluates on the UI thread.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Value = number | Expression

/**
 * A value derived from native events. Make one with `scroll`,
 * `interpolate`, `add`, `multiply` or `diffClamp`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Expression =
  | {
    readonly _tag: "Scroll"
    readonly source: string
    readonly axis: "x" | "y"
  }
  | {
    readonly _tag: "Interpolate"
    readonly input: Value
    readonly inputRange: ReadonlyArray<number>
    readonly outputRange: ReadonlyArray<number>
    readonly extrapolate: "extend" | "clamp" | "identity"
  }
  | {
    readonly _tag: "Add" | "Multiply"
    readonly left: Value
    readonly right: Value
  }
  | {
    readonly _tag: "DiffClamp"
    readonly input: Value
    readonly min: number
    readonly max: number
  }

/**
 * Animated style values. Each transform has one key, as in a React Native
 * `transform`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Style<A = Value> {
  readonly opacity?: A | undefined
  readonly transform?:
    | ReadonlyArray<{ readonly [K in TransformKey]?: A }>
    | undefined
}

/**
 * How a target is reached. Make one with `timing` or `spring`, or use
 * `immediate`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Transition {
  /** The native driver's config, without `toValue`. */
  readonly config: object | undefined
}

/**
 * Sets the value at once. Like any transition, it commits the end value and
 * fires `animationEnd`.
 *
 * @stability experimental
 * @category transitions
 * @since 0.1.0
 */
export const immediate: Transition = { config: undefined }

const frame = 1000 / 60
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2

/**
 * Animates over `duration` milliseconds (300 by default) along `easing`
 * (a cubic ease in and out by default), after `delay` milliseconds. The
 * curve is sampled once per frame for the native driver.
 *
 * @stability experimental
 * @category transitions
 * @since 0.1.0
 */
export const timing = (options?: {
  readonly duration?: number | undefined
  readonly easing?: ((t: number) => number) | undefined
  readonly delay?: number | undefined
}): Transition => {
  const easing = options?.easing ?? easeInOut
  const count = Math.round((options?.duration ?? 300) / frame)
  const frames: Array<number> = []
  for (let i = Math.round((options?.delay ?? 0) / frame); i > 0; i--) {
    frames.push(0)
  }
  for (let i = 0; i < count; i++) frames.push(easing(i / count))
  frames.push(easing(1))
  return { config: { type: "frames", frames, iterations: 1 } }
}

/**
 * Animates with a spring. The defaults match React Native's
 * `Animated.spring`.
 *
 * @stability experimental
 * @category transitions
 * @since 0.1.0
 */
export const spring = (options?: {
  readonly stiffness?: number | undefined
  readonly damping?: number | undefined
  readonly mass?: number | undefined
  readonly velocity?: number | undefined
  readonly overshootClamping?: boolean | undefined
}): Transition => ({
  config: {
    type: "spring",
    stiffness: options?.stiffness ?? 230.2,
    damping: options?.damping ?? 22,
    mass: options?.mass ?? 1,
    initialVelocity: options?.velocity ?? 0,
    overshootClamping: options?.overshootClamping ?? false,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
    iterations: 1
  }
})

/**
 * The scroll offset along `axis` of the scroll view named `source` with
 * `Animation.source`. It is `0` until the scroll view scrolls.
 *
 * @stability experimental
 * @category expressions
 * @since 0.1.0
 */
export const scroll = (source: string, axis: "x" | "y"): Expression => ({
  _tag: "Scroll",
  source,
  axis
})

/**
 * Maps `input` from `inputRange` onto `outputRange`, linearly between
 * stops. Outside the range, `"extend"` (the default) continues the nearest
 * segment, `"clamp"` holds its end and `"identity"` returns `input`.
 *
 * @stability experimental
 * @category expressions
 * @since 0.1.0
 */
export const interpolate = (
  input: Value,
  inputRange: ReadonlyArray<number>,
  outputRange: ReadonlyArray<number>,
  extrapolate: "extend" | "clamp" | "identity" = "extend"
): Expression => ({
  _tag: "Interpolate",
  input,
  inputRange,
  outputRange,
  extrapolate
})

/**
 * The sum of two values.
 *
 * @stability experimental
 * @category expressions
 * @since 0.1.0
 */
export const add = (left: Value, right: Value): Expression => ({
  _tag: "Add",
  left,
  right
})

/**
 * The product of two values.
 *
 * @stability experimental
 * @category expressions
 * @since 0.1.0
 */
export const multiply = (left: Value, right: Value): Expression => ({
  _tag: "Multiply",
  left,
  right
})

/**
 * Follows the changes of `input`, held between `min` and `max`: a header
 * that hides as a list scrolls down and comes back as soon as it scrolls up.
 *
 * @stability experimental
 * @category expressions
 * @since 0.1.0
 */
export const diffClamp = (
  input: Value,
  min: number,
  max: number
): Expression => ({ _tag: "DiffClamp", input, min, max })

/**
 * Animates the element's `opacity` and `transform` to `style`, with
 * `transition` (`timing()` by default). A later call on the same element
 * replaces the keys it sets, so each key can have its own transition.
 *
 * **Details**
 *
 * The element first shows `from`, or else `style`, and animates from there.
 * An expression shows its value at a scroll offset of `0` until the driver
 * takes over. When every target is reached, the end values are committed,
 * so a press on a moved view lands where it is shown, and `animationEnd`
 * fires. A target set with `immediate` is reached at once.
 *
 * **Gotchas**
 *
 * Native keeps showing the driver's last value for a key until the view is
 * deleted. When a mounted element stops animating a key, it gets a new
 * native view, which loses native state such as a scroll offset or focus.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const style: {
  (
    style: Style,
    transition?: Transition,
    from?: Style<number>
  ): <B extends Native.Element<any, any, any, any, any>>(self: B) => B
  <B extends Native.Element<any, any, any, any, any>>(
    self: B,
    style: Style,
    transition?: Transition,
    from?: Style<number>
  ): B
} = /* @__PURE__ */ dual(
  (args) => View.isElementBuilder(args[0]),
  (
    self: Native.Element<unknown>,
    style: Style,
    transition?: Transition,
    from?: Style<number>
  ) => {
    install()
    const spec: Record<string, Layer> = { ...(self.props.animation as Spec) }
    for (const key in style) {
      const value = style[key as keyof Style]
      // A transform with no keys, such as `[]` or `[{}]`, animates nothing.
      if (
        value === undefined ||
        (Array.isArray(value) && !(value as Transforms).some(hasKey))
      ) delete spec[key]
      else spec[key] = { value, transition, from: from?.[key as keyof Style] }
    }
    return self.prop("animation", hasKey(spec) ? spec : undefined)
  }
)

const hasKey = (o: object): boolean => {
  for (const _ in o) return true
  return false
}

/**
 * Names a scroll view as the source of `scroll` expressions. Make the name
 * with `h.id`, which is unique to the component instance, and pass it to the
 * elements that follow the scroll, in this component or another. Setting
 * `scrollEventThrottle` to 17 ms or more (or a negative value on iOS) on the
 * scroll view throttles the native driver too, because both platforms drop
 * throttled events before delivering them to animated nodes.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const source: {
  (
    name: string
  ): <B extends Native.ViewElement<any, any, any, "scroll">>(self: B) => B
  <B extends Native.ViewElement<any, any, any, "scroll">>(
    self: B,
    name: string
  ): B
} = /* @__PURE__ */ dual(
  2,
  (self: Native.ViewElement<unknown>, name: string) => {
    install()
    return self.prop("animationSource", name)
  }
)

/**
 * Docks children of the scroll view at the top while it scrolls past them,
 * as React Native's `stickyHeaderIndices` does. `indices` count the
 * scroll view's children, and each header is pushed up by the next one.
 *
 * **Details**
 *
 * - `hiddenOnScroll`, as `stickyHeaderHiddenOnScroll`: a docked header
 *   hides as the list scrolls down and comes back as it scrolls up.
 * - `inverted`, as `invertStickyHeaders`: headers dock at the bottom,
 *   for a list that starts at its end.
 *
 * The native driver moves each header, so docking follows the scroll on the
 * UI thread. Shortly after the scroll stops, the position native reports is
 * committed, so a press on a docked header lands on it. A header shows
 * above the rows (`zIndex` 10), and its `transform` is the driver's. Its
 * own `zIndex` and `transform` show again once it stops being a header.
 * Headers dock below a `contentInset` top.
 *
 * **Gotchas**
 *
 * Headers dock along `y` only. A `scrollEventThrottle` of 17 ms or more
 * makes docking lag the scroll. On Android, don't set
 * `removeClippedSubviews` on the scroll view.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const stickyHeaders: {
  (
    indices: ReadonlyArray<number>,
    options?: StickyOptions
  ): <B extends Native.ViewElement<any, any, any, "scroll">>(self: B) => B
  <B extends Native.ViewElement<any, any, any, "scroll">>(
    self: B,
    indices: ReadonlyArray<number>,
    options?: StickyOptions
  ): B
} = /* @__PURE__ */ dual(
  (args) => View.isElementBuilder(args[0]),
  (
    self: Native.ViewElement<unknown>,
    indices: ReadonlyArray<number>,
    options?: StickyOptions
  ) => {
    installSticky()
    return self.prop(
      "stickyHeaders",
      indices.length === 0 ? undefined : {
        indices,
        hiddenOnScroll: options?.hiddenOnScroll === true,
        inverted: options?.inverted === true
      }
    )
  }
)

/**
 * Options of {@link stickyHeaders}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface StickyOptions {
  readonly hiddenOnScroll?: boolean | undefined
  readonly inverted?: boolean | undefined
}

type Transforms = NonNullable<Style["transform"]>

interface Layer {
  readonly value: Value | Transforms
  readonly transition: Transition | undefined
  readonly from: number | Style<number>["transform"]
}

type Spec = Readonly<Record<string, Layer>>

interface Target {
  readonly tag: number
  to: number
  /** The running animation's id, or `0`. */
  anim: number
}

interface Graph {
  /** A props node for the node's own view, and one for its wrapper's. */
  readonly props: ReadonlyArray<Connection>
  /** Nodes other than the targets. */
  readonly nodes: Array<number>
  /** Parent and child tags, in pairs. */
  readonly edges: Array<number>
  readonly sources: Array<Source>
  /** The node native reports the value of, or `0`. */
  readonly listened: number
}

interface Connection {
  readonly tag: number
  readonly outer: boolean
  /** The view tag it is connected to, or `0`. */
  view: number
}

interface Entry {
  readonly node: NativeNode
  spec: Spec | undefined
  built: Spec | undefined
  shape: string | undefined
  /** The props the wrapper takes, if the graph was built for one. */
  outer: RegExp | undefined
  graph: Graph | undefined
  /** The value nodes of numeric leaves, by path. A rebuild keeps them. */
  readonly targets: Map<string, Target>
}

interface Source {
  node: NativeNode | undefined
  /** The view tag the scroll events are bound to, or `0`. */
  bound: number
  users: number
  /** The offset the value nodes start at, and the inset added to them. */
  start: number
  inset: number
  x?: number | undefined
  y?: number | undefined
}

interface Sticky {
  options: {
    readonly indices: ReadonlyArray<number>
    readonly hiddenOnScroll: boolean
    readonly inverted: boolean
  }
  /** The name of the source the headers follow, private to the scroll view. */
  readonly source: string
  /** The children at `indices`, as of the last commit. */
  kids: ReadonlyArray<NativeNode | undefined>
  readonly headers: Map<NativeNode, Header>
  timer: ReturnType<typeof setTimeout> | undefined
}

interface Header {
  /** The translation's shape, to rebuild only when the layout changes it. */
  key: string
  /** The translation native last reported. */
  value: number | undefined
}

/** What the driver follows on one surface. */
interface Driver {
  readonly entries: Map<NativeNode, Entry>
  readonly sources: Map<string, Source>
  /** The scroll views with sticky headers. */
  readonly sticky: Map<NativeNode, Sticky>
}

/** The part of `NativeAnimatedModule` the driver uses. */
interface AnimatedModule {
  createAnimatedNode(tag: number, config: object): void
  connectAnimatedNodes(parent: number, child: number): void
  disconnectAnimatedNodes(parent: number, child: number): void
  connectAnimatedNodeToView(tag: number, viewTag: number): void
  disconnectAnimatedNodeFromView(tag: number, viewTag: number): void
  dropAnimatedNode(tag: number): void
  startAnimatingNode(
    id: number,
    tag: number,
    config: object,
    end: (result: { readonly finished: boolean }) => void
  ): void
  stopAnimation(id: number): void
  setAnimatedNodeValue(tag: number, value: number): void
  setAnimatedNodeOffset(tag: number, offset: number): void
  startListeningToAnimatedNodeValue(tag: number): void
  stopListeningToAnimatedNodeValue(tag: number): void
  addListener?(event: string): void
  addAnimatedEventToView(viewTag: number, event: string, mapping: object): void
  removeAnimatedEventFromView(
    viewTag: number,
    event: string,
    valueTag: number
  ): void
  startOperationBatch?(): void
  finishOperationBatch?(): void
}

const drivers = new WeakMap<Native.ViewHost, Driver>()
// The specs shown without a native driver.
const plain = new WeakMap<NativeNode, Spec>()
// Each node's spec from `style`, and the transform it gets as a sticky
// header, which replaces the spec's.
const own = new WeakMap<NativeNode, Spec>()
const stuck = new WeakMap<NativeNode, Layer>()
// A header's own `zIndex` and `transform`, shown again once it isn't one.
const base = new WeakMap<NativeNode, Record<string, unknown>>()
// What a header does with its translation when native reports it, and the
// header of each translation node native reports.
const hearing = new WeakMap<NativeNode, (value: number) => void>()
const heard = new Map<number, NativeNode>()
let listening = false
// The sticky headers' part of the driver, set by the first `stickyHeaders`
// so that apps that dock no headers bundle none of it.
let docking:
  | {
    /** Lays the headers out from the last commit. */
    readonly measure: (d: Driver) => void
    /** Whether native reports `n`'s translation to its header. */
    readonly hears: (n: NativeNode) => boolean
    readonly listen: (tag: number, n: NativeNode) => void
    readonly unlisten: (tag: number) => void
  }
  | undefined
let animated: AnimatedModule | null | undefined
let installed = false
let batching = false
let fallback: Transition | undefined
// React Native's `Animated` counts node tags and animation ids from 1.
// Starting far above keeps the two apart in an app that loads both.
let lastTag = 1 << 24

const install = () => {
  if (installed) return
  installed = true
  props.set("animation", setSpec)
  props.set("animationSource", setSource)
  commits.add(flush)
}

const installSticky = () => {
  if (docking !== undefined) return
  install()
  props.set("stickyHeaders", setSticky)
  props.set("zIndex", keep("zIndex"))
  props.set("transform", keep("transform"))
  precommits.add(assign)
  docking = {
    measure: (d) => {
      for (const [n, st] of d.sticky) if (mounted(n)) measure(d, n, st)
    },
    hears: (n) => hearing.has(n),
    listen,
    unlisten: (tag) => {
      native().stopListeningToAnimatedNodeValue(tag)
      heard.delete(tag)
    }
  }
}

// Sets the style key, or keeps it for when a header stops being one.
const keep =
  (key: string) => (n: NativeNode, value: unknown, host: Native.ViewHost) => {
    const own = base.get(n)
    if (own === undefined) host.set(n, key, value)
    else own[key] = value
  }

const driverOf = (host: Native.ViewHost): Driver | undefined => {
  // Bridgeless iOS registers the module under its TurboModule name.
  if (animated === undefined) {
    animated = (host.os === "ios"
      ? get<AnimatedModule>("NativeAnimatedTurboModule")
      : null) ?? get<AnimatedModule>("NativeAnimatedModule") ?? null
  }
  if (animated === null) return undefined
  let d = drivers.get(host)
  if (d === undefined) {
    drivers.set(
      host,
      d = { entries: new Map(), sources: new Map(), sticky: new Map() }
    )
  }
  return d
}

const setSpec = (n: NativeNode, value: unknown, host: Native.ViewHost) => {
  const spec = value as Spec | undefined
  const d = driverOf(host)
  if (d !== undefined) {
    if (spec === undefined) own.delete(n)
    else own.set(n, spec)
    return show(d, n, host)
  }
  // Without a native driver, the view shows its targets.
  for (const key in plain.get(n)) {
    if (spec?.[key] === undefined) host.set(n, key, undefined)
  }
  for (const key in spec) host.set(n, key, resolve(spec[key]!.value, true))
  if (spec === undefined) plain.delete(n)
  else plain.set(n, spec)
}

const show = (d: Driver, n: NativeNode, host: Native.ViewHost) => {
  const mine = own.get(n)
  const transform = stuck.get(n)
  const spec = transform === undefined ? mine : { ...mine, transform }
  const entry = d.entries.get(n)
  if (entry !== undefined) {
    let released = false
    for (const key in entry.spec) {
      if (spec?.[key] !== undefined) continue
      host.set(n, key, undefined)
      released = true
    }
    // Native keeps showing the driver's last value for a key the graph no
    // longer drives, on both platforms, until the view is deleted.
    if (released && entry.graph?.props.some((c) => c.view !== 0)) {
      host.recreate(n.outer ?? n)
    }
    entry.spec = spec
    return
  }
  if (spec === undefined) return
  d.entries.set(n, {
    node: n,
    spec,
    built: undefined,
    shape: undefined,
    outer: undefined,
    graph: undefined,
    targets: new Map()
  })
  // Fabric flattens a view with no visual props, leaving the driver nothing
  // to update.
  host.set(n, "collapsable", false)
  for (const key in spec) {
    const layer = spec[key]!
    host.set(n, key, resolve(layer.from ?? layer.value, true))
  }
}

const setSource = (n: NativeNode, name: unknown, host: Native.ViewHost) => {
  const d = driverOf(host)
  if (d === undefined) return
  for (const [key, s] of d.sources) {
    if (s.node === n && key !== d.sticky.get(n)?.source) s.node = undefined
  }
  if (typeof name === "string") sourceOf(d, name).node = n
}

const setSticky = (n: NativeNode, value: unknown, host: Native.ViewHost) => {
  const d = driverOf(host)
  if (d === undefined) return
  const options = (value ?? noHeaders) as Sticky["options"]
  const st = d.sticky.get(n)
  if (st !== undefined) st.options = options
  else if (value !== undefined) {
    d.sticky.set(n, {
      options,
      source: "sticky " + (lastTag += 1),
      kids: [],
      headers: new Map(),
      timer: undefined
    })
  }
}

const noHeaders: Sticky["options"] = {
  indices: [],
  hiddenOnScroll: false,
  inverted: false
}

const unmeasured = [0, 0] as const

// Before a commit: makes the scroll views' children at their indices
// sticky headers, and the others not.
const assign = (host: Native.ViewHost) => {
  const d = drivers.get(host)
  if (d === undefined) return
  for (const [n, st] of d.sticky) {
    const top = rootOf(n).kind
    const live = top === surface || top === container
    const kids: Array<NativeNode | undefined> = []
    if (live) {
      const children: Array<NativeNode> = []
      for (let k = n.inner!.first; k !== undefined; k = k.next) {
        // A wrapper such as `RefreshControl` isn't a child native counts.
        if (k.kind.attach === undefined) children.push(k)
      }
      for (const i of st.options.indices) kids.push(children[i])
    }
    st.kids = kids
    for (const h of st.headers.keys()) {
      if (kids.includes(h)) continue
      const { zIndex, transform } = base.get(h)!
      st.headers.delete(h)
      base.delete(h)
      stuck.delete(h)
      hearing.delete(h)
      show(d, h, host)
      host.set(h, "zIndex", zIndex)
      if (own.get(h)?.transform === undefined) {
        host.set(h, "transform", transform)
      }
    }
    for (const h of kids) {
      if (h === undefined || st.headers.has(h)) continue
      const { outer, props } = h
      base.set(h, {
        zIndex: props.zIndex ?? outer?.props.zIndex,
        transform: props.transform ?? outer?.props.transform
      })
      hearing.set(h, (value) => {
        st.headers.get(h)!.value = value
        commitLater(st, host)
      })
      translate(d, st, h, undefined, undefined, undefined)
      // As React Native's `ScrollViewStickyHeader`, above the rows.
      host.set(h, "zIndex", 10)
    }
    if (live) {
      // As React Native's `ScrollView`: the offset starts at `contentOffset`,
      // and a top inset, which iOS reports as a negative offset at rest, is
      // added to it.
      const s = sourceOf(d, st.source)
      s.node = n
      s.start = (n.props.contentOffset as any)?.y ?? 0
      const inset = (n.props.contentInset as any)?.top ?? 0
      if (inset !== s.inset) {
        s.inset = inset
        if (s.y !== undefined) native().setAnimatedNodeOffset(s.y, inset)
      }
    } else {
      clearTimeout(st.timer)
      d.sticky.delete(n)
      sourceOf(d, st.source).node = undefined
    }
  }
}

// After a commit: lays each header's translation out from where native
// laid the headers out, as React Native's `ScrollViewStickyHeader`.
const measure = (d: Driver, n: NativeNode, st: Sticky) => {
  const content = rectOf(n.inner!, false)
  const layouts = st.kids.map((h) => {
    const rect = h === undefined ? undefined : rectOf(h, false)
    return rect == null || content == null
      ? undefined
      : [rect[1]! - content[1]!, rect[3]!] as const
  })
  const height = st.options.inverted ? rectOf(n, false)?.[3] : undefined
  for (let i = 0; i < st.kids.length; i++) {
    const h = st.kids[i]
    if (h !== undefined) {
      translate(d, st, h, layouts[i], layouts[i + 1]?.[0], height)
    }
  }
}

// Gives the header the translation for its layout.
const translate = (
  d: Driver,
  st: Sticky,
  h: NativeNode,
  layout: readonly [number, number] | undefined,
  next: number | undefined,
  height: number | undefined
) => {
  const [y, size] = layout ?? unmeasured
  const offset = scroll(st.source, "y")
  const input = [-1, 0]
  const output = [0, 0]
  if (layout === undefined) {
    // Not laid out yet: in place.
  } else if (st.options.inverted) {
    if (height !== undefined) {
      const start = y + size - height
      if (start > 0) {
        input.push(start, start + 1)
        output.push(0, 1)
        const collision = (next ?? 0) - size - height
        if (collision > start) {
          input.push(collision, collision + 1)
          output.push(collision - start, collision - start)
        }
      }
    }
  } else {
    input.push(y)
    output.push(0)
    const collision = (next ?? 0) - size
    if (collision >= y) {
      input.push(collision, collision + 1)
      output.push(collision - y, collision - y)
    } else {
      input.push(y + 1)
      output.push(1)
    }
  }
  let translation = interpolate(offset, input, output)
  if (st.options.hiddenOnScroll) {
    // Follows the scroll past the header's place, up to its height.
    translation = add(
      translation,
      diffClamp(interpolate(offset, [y - 1, y, y + 1], [0, 0, -1]), -size, 0)
    )
  }
  const key = JSON.stringify(translation)
  const header = st.headers.get(h)
  if (key === header?.key) return
  st.headers.set(h, { key, value: header?.value })
  stuck.set(h, {
    value: [{ translateY: translation }],
    transition: undefined,
    from: undefined
  })
  show(d, h, h.host)
}

// Commits where native shows the headers, so Fabric's shadow tree agrees
// for hit tests, once the scroll pauses, as React Native's
// `ScrollViewStickyHeader` does on Fabric.
const commitLater = (st: Sticky, host: Native.ViewHost) => {
  clearTimeout(st.timer)
  st.timer = setTimeout(() => {
    st.timer = undefined
    for (const [h, { value }] of st.headers) {
      if (value !== undefined && mounted(h)) {
        host.set(h, "transform", [{ translateY: value }])
      }
    }
    host.commit()
  }, host.os === "android" ? 15 : 64)
}

const sourceOf = (d: Driver, name: string): Source => {
  let s = d.sources.get(name)
  if (s === undefined) {
    d.sources.set(
      name,
      s = { node: undefined, bound: 0, users: 0, start: 0, inset: 0 }
    )
  }
  return s
}

// A style key's value, with scrolls at offset 0 when `at0`, or else
// `undefined` if it holds an expression.
const resolve = (value: Layer["value"], at0: boolean): unknown => {
  if (typeof value === "number") return value
  if (!Array.isArray(value)) {
    return at0 ? evaluate(value as Expression) : undefined
  }
  const out: Array<object> = []
  for (const item of value as Transforms) {
    for (const key in item) {
      const v = item[key as TransformKey]!
      if (typeof v !== "number" && !at0) return undefined
      out.push({ [key]: evaluate(v) })
    }
  }
  return out
}

const evaluate = (v: Value): number => {
  if (typeof v === "number") return v
  switch (v._tag) {
    case "Scroll":
      return 0
    case "Add":
      return evaluate(v.left) + evaluate(v.right)
    case "Multiply":
      return evaluate(v.left) * evaluate(v.right)
    case "DiffClamp":
      return Math.min(Math.max(evaluate(v.input), v.min), v.max)
    case "Interpolate": {
      const x = evaluate(v.input)
      const at = v.inputRange
      const to = v.outputRange
      const last = at.length - 1
      if (v.extrapolate === "identity" && (x < at[0]! || x > at[last]!)) {
        return x
      }
      let k = 1
      while (k < last && x > at[k]!) k++
      let t = (x - at[k - 1]!) / (at[k]! - at[k - 1]!)
      if (v.extrapolate === "clamp") t = Math.min(Math.max(t, 0), 1)
      return to[k - 1]! + t * (to[k]! - to[k - 1]!)
    }
  }
}

// Paths identify numeric targets across rebuilds: `opacity`, `transform.0.scale`.
const leaves = (
  spec: Spec,
  f: (path: string, value: Value, layer: Layer, from?: number) => void
) => {
  for (const key in spec) {
    const layer = spec[key]!
    if (!Array.isArray(layer.value)) {
      f(key, layer.value as Value, layer, layer.from as number | undefined)
      continue
    }
    const items = layer.value as Transforms
    const from = layer.from as Style<number>["transform"]
    for (let i = 0; i < items.length; i++) {
      for (const name in items[i]) {
        const k = name as TransformKey
        f(key + "." + i + "." + name, items[i]![k]!, layer, from?.[i]?.[k])
      }
    }
  }
}

// Two specs of one shape share a graph: they differ only in targets.
const shapeOf = (spec: Spec): string => {
  let out = ""
  leaves(spec, (path, value) => {
    out += path + (typeof value === "number" ? ";" : JSON.stringify(value))
  })
  return out
}

// Android runs the operations of a batch together, in one frame.
const native = (): AnimatedModule => {
  if (!batching) {
    batching = true
    animated!.startOperationBatch?.()
  }
  return animated!
}

const flush = (host: Native.ViewHost) => {
  const d = drivers.get(host)
  if (d === undefined) return
  docking?.measure(d)
  for (const [n, e] of d.entries) {
    const top = rootOf(n).kind
    // A node outside a surface or a kept child's container has been dropped.
    if (e.spec === undefined || (top !== surface && top !== container)) {
      release(e)
      for (const t of e.targets.values()) drop(t)
      d.entries.delete(n)
      continue
    }
    // As React Native's `AnimatedScrollView`, the driver splits the keys
    // between the view and its wrapper as the host splits the props.
    const outer = n.outer?.kind.attach!(host)!.outer
    if (e.spec !== e.built || outer !== e.outer) update(d, e, e.spec, outer)
    // The host gives a recreated view a new tag, and native drops the view
    // of a kept child that is out of the tree.
    for (const c of e.graph!.props) {
      const view = top === surface ? (c.outer ? n.outer! : n).tag : 0
      if (view === c.view) continue
      const m = native()
      if (c.view !== 0) m.disconnectAnimatedNodeFromView(c.tag, c.view)
      if (view !== 0) m.connectAnimatedNodeToView(c.tag, view)
      c.view = view
    }
  }
  for (const [name, s] of d.sources) {
    const top = s.node === undefined ? undefined : rootOf(s.node).kind
    if (top !== undefined && top !== surface && top !== container) {
      s.node = undefined
    }
    bind(s, top === surface && s.users > 0 ? s.node!.tag : 0, host.os)
    if (s.users === 0) {
      if (s.x !== undefined) native().dropAnimatedNode(s.x)
      if (s.y !== undefined) native().dropAnimatedNode(s.y)
      s.x = s.y = undefined
      if (s.node === undefined) d.sources.delete(name)
    }
  }
  if (!batching) return
  batching = false
  // iOS runs graph operations at the next mount, which a commit that only
  // changes the graph doesn't make. Stopping an animation that doesn't
  // exist runs them now.
  if (host.os === "ios") animated!.stopAnimation(0)
  animated!.finishOperationBatch?.()
}

const mapping = (axis: "x" | "y", tag: number) => ({
  nativeEventPath: ["contentOffset", axis],
  animatedValueTag: tag
})

const bind = (s: Source, view: number, os: string) => {
  if (view === s.bound) return
  const m = native()
  for (const axis of ["x", "y"] as const) {
    const tag = s[axis]
    if (tag === undefined) continue
    if (s.bound !== 0) {
      m.removeAnimatedEventFromView(s.bound, "onScroll", tag)
      // Both platforms bind `onScrollEnded` with `onScroll`, but only
      // Android removes it with `onScroll`.
      if (os === "ios") {
        m.removeAnimatedEventFromView(s.bound, "onScrollEnded", tag)
      }
    }
    if (view !== 0) {
      m.addAnimatedEventToView(view, "onScroll", mapping(axis, tag))
    }
  }
  s.bound = view
}

const update = (
  d: Driver,
  e: Entry,
  spec: Spec,
  outer: RegExp | undefined
) => {
  e.built = spec
  const shape = shapeOf(spec)
  if (shape !== e.shape || outer !== e.outer) {
    e.shape = shape
    e.outer = outer
    rebuild(d, e, spec, outer)
  }
  let changed = false
  leaves(spec, (path, value, layer) => {
    const target = e.targets.get(path)
    if (target === undefined || target.to === value) return
    changed = true
    go(e, target, value as number, layer.transition ?? (fallback ??= timing()))
  })
  // An immediate change ends at once. Report it after the commit.
  if (changed && idle(e)) {
    Promise.resolve().then(() => {
      if (e.graph !== undefined && idle(e)) settle(e)
    })
  }
}

// Replaces the graph, keeping the targets that are still numeric leaves and
// their running animations.
const rebuild = (
  d: Driver,
  e: Entry,
  spec: Spec,
  outer: RegExp | undefined
) => {
  const m = native()
  release(e)
  const kept = new Set<string>()
  const nodes: Array<number> = []
  const edges: Array<number> = []
  const sources: Array<Source> = []
  const make = (config: object, inputs: ReadonlyArray<number>) => {
    const tag = lastTag += 1
    m.createAnimatedNode(tag, config)
    nodes.push(tag)
    for (const input of inputs) {
      m.connectAnimatedNodes(input, tag)
      edges.push(input, tag)
    }
    return tag
  }
  const lower = (v: Value, path?: string, from?: number): number => {
    if (typeof v === "number") {
      if (path === undefined) {
        return make({ type: "value", value: v, offset: 0 }, [])
      }
      kept.add(path)
      let t = e.targets.get(path)
      if (t === undefined) {
        const value = from ?? v
        const tag = lastTag += 1
        m.createAnimatedNode(tag, { type: "value", value, offset: 0 })
        e.targets.set(path, t = { tag, to: value, anim: 0 })
      }
      return t.tag
    }
    switch (v._tag) {
      case "Scroll": {
        const s = sourceOf(d, v.source)
        s.users++
        sources.push(s)
        let tag = s[v.axis]
        if (tag === undefined) {
          tag = s[v.axis] = lastTag += 1
          m.createAnimatedNode(tag, {
            type: "value",
            value: s.start,
            offset: s.inset
          })
          if (s.bound !== 0) {
            m.addAnimatedEventToView(s.bound, "onScroll", mapping(v.axis, tag))
          }
        }
        return tag
      }
      case "Interpolate": {
        const input = lower(v.input)
        return make({
          type: "interpolation",
          inputRange: v.inputRange,
          outputRange: v.outputRange,
          outputType: null,
          extrapolateLeft: v.extrapolate,
          extrapolateRight: v.extrapolate
        }, [input])
      }
      case "DiffClamp": {
        const input = lower(v.input)
        return make(
          { type: "diffclamp", input, min: v.min, max: v.max },
          [input]
        )
      }
      default: {
        const input = [lower(v.left), lower(v.right)]
        const type = v._tag === "Add" ? "addition" : "multiplication"
        return make({ type, input }, input)
      }
    }
  }
  // The view's style, and its wrapper's.
  const styles: [Record<string, number>, Record<string, number>] = [{}, {}]
  const transforms: Array<object> = []
  const moved: Array<number> = []
  let listened = 0
  leaves(spec, (path, value, _, from) => {
    const tag = lower(value, path, from)
    if (path === "transform.0.translateY" && docking?.hears(e.node)) {
      listened = tag
    }
    const dot = path.lastIndexOf(".")
    if (dot === -1) return styles[outer?.test(path) ? 1 : 0][path] = tag
    transforms.push({
      type: "animated",
      property: path.slice(dot + 1),
      nodeTag: tag
    })
    moved.push(tag)
  })
  if (moved.length > 0) {
    styles[outer?.test("transform") ? 1 : 0].transform = make(
      { type: "transform", transforms },
      moved
    )
  }
  const props: Array<Connection> = []
  for (let i = 0; i < 2; i++) {
    const style = styles[i]!
    const inputs = Object.values(style)
    if (inputs.length === 0) continue
    const tag = make({ type: "style", style }, inputs)
    props.push({
      tag: make({ type: "props", props: { style: tag } }, [tag]),
      outer: i === 1,
      view: 0
    })
  }
  if (listened !== 0) docking!.listen(listened, e.node)
  e.graph = { props, nodes, edges, sources, listened }
  for (const [path, t] of e.targets) {
    if (kept.has(path)) continue
    drop(t)
    e.targets.delete(path)
  }
}

// Has native report the value of node `tag` to `n`'s header, as React
// Native's `Animated` does for a listener on a native node.
const listen = (tag: number, n: NativeNode) => {
  const m = native()
  if (!listening) {
    listening = true
    // iOS sends the events only while the module counts a listener.
    if (n.host.os === "ios") m.addListener?.("onAnimatedValueUpdate")
    RCTDeviceEventEmitter.addListener("onAnimatedValueUpdate", (data: any) => {
      const h = heard.get(data?.tag)
      // Only Android reports a value node's offset apart.
      if (h !== undefined) hearing.get(h)?.(data.value + (data.offset ?? 0))
    })
  }
  m.startListeningToAnimatedNodeValue(tag)
  heard.set(tag, n)
}

const go = (e: Entry, t: Target, to: number, transition: Transition) => {
  const m = native()
  if (t.anim !== 0) m.stopAnimation(t.anim)
  t.to = to
  t.anim = 0
  const config = transition.config
  if (config === undefined) return m.setAnimatedNodeValue(t.tag, to)
  const id = t.anim = lastTag += 1
  m.startAnimatingNode(id, t.tag, { ...config, toValue: to }, (result) => {
    if (t.anim !== id) return
    t.anim = 0
    if (result.finished && idle(e)) settle(e)
  })
}

const idle = (e: Entry): boolean => {
  for (const t of e.targets.values()) if (t.anim !== 0) return false
  return true
}

// Commits the end values, so Fabric's shadow tree, and a view it recreates,
// show what the driver shows.
const settle = (e: Entry) => {
  const n = e.node
  const spec = e.built!
  for (const key in spec) {
    const value = resolve(spec[key]!.value, false)
    if (value !== undefined) n.host.set(n, key, value)
  }
  n.host.commit()
  n.host.fire(n, "animationEnd", {})
}

// Disconnects the graph and drops its nodes, but not the targets.
const release = (e: Entry) => {
  const g = e.graph
  if (g === undefined) return
  const m = native()
  e.graph = undefined
  for (const c of g.props) {
    if (c.view !== 0) m.disconnectAnimatedNodeFromView(c.tag, c.view)
  }
  if (g.listened !== 0) docking!.unlisten(g.listened)
  for (let i = 0; i < g.edges.length; i += 2) {
    m.disconnectAnimatedNodes(g.edges[i]!, g.edges[i + 1]!)
  }
  for (const tag of g.nodes) m.dropAnimatedNode(tag)
  for (const s of g.sources) s.users--
}

const drop = (t: Target) => {
  const m = native()
  if (t.anim !== 0) m.stopAnimation(t.anim)
  t.anim = 0
  m.dropAnimatedNode(t.tag)
}
