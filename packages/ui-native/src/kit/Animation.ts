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
import { commits, listeners, precommits, props } from "../internal/kinds.ts"
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
  /** Whether native reports the value of its one leaf to the node's header. */
  readonly reported?: boolean | undefined
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
  /** A scroll view's sticky headers' own, kept while it is in the tree. */
  pinned?: boolean | undefined
}

interface Sticky {
  options:
    | {
      readonly indices: ReadonlyArray<number>
      readonly hiddenOnScroll: boolean
      readonly inverted: boolean
    }
    | undefined
  /** The name of the source the headers follow, private to the scroll view. */
  readonly source: string
  /** The children at `indices`, as of the last commit. */
  kids: ReadonlyArray<NativeNode | undefined>
  readonly headers: Set<NativeNode>
  timer: ReturnType<typeof setTimeout> | undefined
}

interface Header {
  readonly st: Sticky
  /** The layout `layer` is for, to rebuild it only when that changes. */
  key: string | undefined
  /** The transform shown in place of the node's own. */
  layer: Layer | undefined
  /** The translation native last reported. */
  value: number | undefined
}

/** What the driver follows on one surface. */
interface Driver {
  readonly module: AnimatedModule
  /** An operation batch is open on Android. */
  batching: boolean
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

// `null` for a host whose device has no native driver.
const drivers = new WeakMap<Native.ViewHost, Driver | null>()
// The specs shown without a native driver.
const plain = new WeakMap<NativeNode, Spec>()
// Each node's spec from `style`, the sticky headers, and the header of
// each node native reports the value of.
const own = new WeakMap<NativeNode, Spec>()
const headers = new WeakMap<NativeNode, Header>()
const heard = new Map<number, NativeNode>()
// The own values of the props a header, or a scroll view with headers,
// shows in their place, to show again after.
const kept = new WeakMap<NativeNode, Record<string, unknown>>()
// Each scroll view's sticky source, kept when its headers go.
const named = new WeakMap<NativeNode, string>()
// The devices whose value reports are followed.
const listening = new WeakSet<Native.Device>()
// The sticky headers' part of the driver, set by the first `stickyHeaders`
// so that apps that dock no headers bundle none of it.
let docking:
  | {
    /** Lays the headers out from the last commit. */
    readonly measure: (d: Driver) => void
    readonly listen: (d: Driver, tag: number, n: NativeNode) => void
    readonly unlisten: (d: Driver, tag: number) => void
  }
  | undefined
let installed = false
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
  props.set("onLayout", keep("onLayout"))
  precommits.add(assign)
  listeners.add(follow)
  docking = {
    measure: (d) => {
      for (const [n, st] of d.sticky) if (mounted(n)) measure(d, n, st)
    },
    listen,
    unlisten: (d, tag) => {
      native(d).stopListeningToAnimatedNodeValue(tag)
      heard.delete(tag)
    }
  }
}

// Sets the prop, or keeps it for when the node shows its own again.
const keep =
  (key: string) => (n: NativeNode, value: unknown, host: Native.ViewHost) => {
    const values = kept.get(n)
    if (values !== undefined && key in values) values[key] = value
    else host.set(n, key, value)
  }

// Shows `values` in place of the node's own. A node can be both a header
// and a scroll view with headers, so each key is kept once.
const replace = (n: NativeNode, values: Record<string, unknown>) => {
  let mine = kept.get(n)
  if (mine === undefined) kept.set(n, mine = {})
  for (const key in values) {
    if (!(key in mine)) mine[key] = n.props[key] ?? n.outer?.props[key]
    if (values[key] !== undefined) n.host.set(n, key, values[key])
  }
}

// Shows the node's own values of `keys` again.
const restore = (n: NativeNode, keys: ReadonlyArray<string>) => {
  const mine = kept.get(n)!
  for (const key of keys) {
    // A transform the node's own `style` drives stays the driver's.
    if (key !== "transform" || own.get(n)?.transform === undefined) {
      n.host.set(n, key, mine[key])
    }
    delete mine[key]
  }
  for (const _ in mine) return
  kept.delete(n)
}

// Lays the headers out again when native changes the layout of one, or of
// a scroll view with headers, which React Native follows with `onLayout`.
const follow = (n: NativeNode, type: string) => {
  if (type === "topLayout" && kept.has(n)) n.host.commit()
}

const driverOf = (host: Native.ViewHost): Driver | null => {
  let d = drivers.get(host)
  if (d === undefined) {
    // Bridgeless iOS registers the module under its TurboModule name.
    const module: AnimatedModule | undefined = (host.os === "ios"
      ? host.device.module("NativeAnimatedTurboModule")
      : null) ?? host.device.module("NativeAnimatedModule")
    drivers.set(
      host,
      d = module == null ? null : {
        module,
        batching: false,
        entries: new Map(),
        sources: new Map(),
        sticky: new Map()
      }
    )
  }
  return d
}

const setSpec = (n: NativeNode, value: unknown, host: Native.ViewHost) => {
  const spec = value as Spec | undefined
  const d = driverOf(host)
  if (d !== null) {
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
  const transform = headers.get(n)?.layer
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
  if (d === null) return
  for (const s of d.sources.values()) {
    if (s.node === n && !s.pinned) s.node = undefined
  }
  if (typeof name === "string") sourceOf(d, name).node = n
}

const setSticky = (n: NativeNode, value: unknown, host: Native.ViewHost) => {
  const d = driverOf(host)
  if (d === null) return
  const options = value as Sticky["options"]
  const st = d.sticky.get(n)
  if (st !== undefined) st.options = options
  else if (options !== undefined) {
    replace(n, { onLayout: true })
    let source = named.get(n)
    if (source === undefined) named.set(n, source = "sticky " + (lastTag += 1))
    d.sticky.set(n, {
      options,
      source,
      kids: [],
      headers: new Set(),
      timer: undefined
    })
  }
}

// Before a commit: makes the scroll views' children at their indices
// sticky headers, and the others not. A scroll view that no longer has
// headers, or was removed, is forgotten.
const assign = (host: Native.ViewHost) => {
  const d = drivers.get(host)
  if (d == null) return
  for (const [n, st] of d.sticky) {
    const top = rootOf(n).kind
    const options = st.options
    const live = options !== undefined &&
      (top === surface || top === container)
    const kids: Array<NativeNode | undefined> = []
    if (live) {
      let i = 0
      for (let k = n.inner!.first; k !== undefined; k = k.next) {
        // A wrapper such as `RefreshControl` isn't a child native counts.
        if (k.kind.attach !== undefined) continue
        const at = options.indices.indexOf(i++)
        if (at !== -1) kids[at] = k
      }
    }
    st.kids = kids
    for (const h of st.headers) {
      if (kids.includes(h)) continue
      st.headers.delete(h)
      headers.delete(h)
      show(d, h, host)
      // A scroll view with headers still follows its layout.
      const keys = ["zIndex", "transform", "onLayout"]
      restore(h, d.sticky.has(h) ? keys.slice(0, 2) : keys)
    }
    for (const h of kids) {
      if (h === undefined || st.headers.has(h)) continue
      st.headers.add(h)
      headers.set(h, { st, key: undefined, layer: undefined, value: undefined })
      // As React Native's `ScrollViewStickyHeader`, above the rows.
      replace(h, { zIndex: 10, transform: undefined, onLayout: true })
      translate(d, h)
    }
    if (live) {
      // As React Native's `ScrollView`: the offset starts at `contentOffset`,
      // and a top inset, which iOS reports as a negative offset at rest, is
      // added to it. The value follows the view until it leaves the tree,
      // so headers that come back start where native has it scrolled.
      const s = sourceOf(d, st.source)
      s.node = n
      s.pinned = true
      s.start = (n.props.contentOffset as any)?.y ?? 0
      const inset = (n.props.contentInset as any)?.top ?? 0
      if (inset !== s.inset) {
        s.inset = inset
        if (s.y !== undefined) native(d).setAnimatedNodeOffset(s.y, inset)
      }
    } else {
      clearTimeout(st.timer)
      d.sticky.delete(n)
      restore(n, headers.has(n) ? [] : ["onLayout"])
    }
  }
}

// After a commit: lays each header's translation out from where native
// laid the headers out, as React Native's `ScrollViewStickyHeader`.
const measure = (d: Driver, n: NativeNode, st: Sticky) => {
  const content = rectOf(n.inner!, false)
  const height = st.options?.inverted ? rectOf(n, false)?.[3] : undefined
  // Each header meets the next one's top.
  let next: number | undefined
  for (let i = st.kids.length - 1; i >= 0; i--) {
    const h = st.kids[i]
    const rect = h === undefined || content == null
      ? undefined
      : rectOf(h, false)
    const y = rect == null ? undefined : rect[1]! - content![1]!
    if (h !== undefined) translate(d, h, y, rect?.[3], next, height)
    next = y
  }
}

// Gives the header the translation for its layout: its top `at` in the
// content, unless not laid out yet, and its height.
const translate = (
  d: Driver,
  h: NativeNode,
  at?: number,
  size = 0,
  next?: number,
  height?: number
) => {
  const header = headers.get(h)!
  const { source, options } = header.st
  const { hiddenOnScroll, inverted } = options!
  const key = [at, size, next, height, hiddenOnScroll, inverted].join()
  if (key === header.key) return
  header.key = key
  const y = at ?? 0
  const offset = scroll(source, "y")
  const input = [-1, 0]
  const output = [0, 0]
  if (at === undefined) {
    // Not laid out yet: in place.
  } else if (inverted) {
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
  if (hiddenOnScroll) {
    // Follows the scroll past the header's place, up to its height.
    translation = add(
      translation,
      diffClamp(interpolate(offset, [y - 1, y, y + 1], [0, 0, -1]), -size, 0)
    )
  }
  header.layer = {
    value: [{ translateY: translation }],
    transition: undefined,
    from: undefined,
    reported: true
  }
  show(d, h, h.host)
}

// Commits where native shows the headers, so Fabric's shadow tree agrees
// for hit tests, once the scroll pauses, as React Native's
// `ScrollViewStickyHeader` does on Fabric.
const commitLater = (st: Sticky, host: Native.ViewHost) => {
  clearTimeout(st.timer)
  st.timer = setTimeout(() => {
    st.timer = undefined
    for (const h of st.headers) {
      const { value } = headers.get(h)!
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
const native = (d: Driver): AnimatedModule => {
  if (!d.batching) {
    d.batching = true
    d.module.startOperationBatch?.()
  }
  return d.module
}

const flush = (host: Native.ViewHost) => {
  const d = drivers.get(host)
  if (d == null) return
  docking?.measure(d)
  for (const [n, e] of d.entries) {
    const top = rootOf(n).kind
    // A node outside a surface or a kept child's container has been dropped.
    if (e.spec === undefined || (top !== surface && top !== container)) {
      release(d, e)
      for (const t of e.targets.values()) drop(d, t)
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
      const m = native(d)
      if (c.view !== 0) m.disconnectAnimatedNodeFromView(c.tag, c.view)
      if (view !== 0) m.connectAnimatedNodeToView(c.tag, view)
      c.view = view
    }
  }
  for (const [name, s] of d.sources) {
    const top = s.node === undefined ? undefined : rootOf(s.node).kind
    if (top !== undefined && top !== surface && top !== container) {
      s.node = undefined
      s.pinned = false
    }
    const used = s.users > 0 || s.pinned === true
    bind(d, s, top === surface && used ? s.node!.tag : 0, host.os)
    if (!used) {
      if (s.x !== undefined) native(d).dropAnimatedNode(s.x)
      if (s.y !== undefined) native(d).dropAnimatedNode(s.y)
      s.x = s.y = undefined
      if (s.node === undefined) d.sources.delete(name)
    }
  }
  if (!d.batching) return
  d.batching = false
  // iOS runs graph operations at the next mount, which a commit that only
  // changes the graph doesn't make. Stopping an animation that doesn't
  // exist runs them now.
  if (host.os === "ios") d.module.stopAnimation(0)
  d.module.finishOperationBatch?.()
}

const mapping = (axis: "x" | "y", tag: number) => ({
  nativeEventPath: ["contentOffset", axis],
  animatedValueTag: tag
})

const bind = (d: Driver, s: Source, view: number, os: string) => {
  if (view === s.bound) return
  const m = native(d)
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
    go(
      d,
      e,
      target,
      value as number,
      layer.transition ?? (fallback ??= timing())
    )
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
  const m = native(d)
  release(d, e)
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
  leaves(spec, (path, value, layer, from) => {
    const tag = lower(value, path, from)
    if (layer.reported) listened = tag
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
  if (listened !== 0) docking!.listen(d, listened, e.node)
  e.graph = { props, nodes, edges, sources, listened }
  for (const [path, t] of e.targets) {
    if (kept.has(path)) continue
    drop(d, t)
    e.targets.delete(path)
  }
}

// Has native report the value of node `tag` to `n`'s header, as React
// Native's `Animated` does for a listener on a native node.
const listen = (d: Driver, tag: number, n: NativeNode) => {
  const m = native(d)
  const device = n.host.device
  if (!listening.has(device)) {
    listening.add(device)
    // iOS sends the events only while the module counts a listener.
    if (n.host.os === "ios") m.addListener?.("onAnimatedValueUpdate")
    device.on("onAnimatedValueUpdate", (data: any) => {
      const n = heard.get(data?.tag)
      const header = n === undefined ? undefined : headers.get(n)
      if (header !== undefined) {
        // Only Android reports a value node's offset apart.
        header.value = data.value + (data.offset ?? 0)
        commitLater(header.st, n!.host)
      }
    })
  }
  m.startListeningToAnimatedNodeValue(tag)
  heard.set(tag, n)
}

const go = (
  d: Driver,
  e: Entry,
  t: Target,
  to: number,
  transition: Transition
) => {
  const m = native(d)
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
const release = (d: Driver, e: Entry) => {
  const g = e.graph
  if (g === undefined) return
  const m = native(d)
  e.graph = undefined
  for (const c of g.props) {
    if (c.view !== 0) m.disconnectAnimatedNodeFromView(c.tag, c.view)
  }
  if (g.listened !== 0) docking!.unlisten(d, g.listened)
  for (let i = 0; i < g.edges.length; i += 2) {
    m.disconnectAnimatedNodes(g.edges[i]!, g.edges[i + 1]!)
  }
  for (const tag of g.nodes) m.dropAnimatedNode(tag)
  for (const s of g.sources) s.users--
}

const drop = (d: Driver, t: Target) => {
  const m = native(d)
  if (t.anim !== 0) m.stopAnimation(t.anim)
  t.anim = 0
  m.dropAnimatedNode(t.tag)
}
