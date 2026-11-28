/**
 * The arithmetic behind a virtual list: which items to render as the list
 * scrolls, how much room to leave for the others, and where a scroll request
 * puts the viewport.
 *
 * A virtual list component keeps a {@link Model}, sends it the
 * {@link Message}s its host reports, such as the scroll offset and the
 * measured size of each rendered item, and draws what {@link plan} returns:
 * the ranges of items to render and the space to leave before, between and
 * after them. Nothing here reads a host. `VirtualList` in `@effect/ui-kit`
 * draws a plan with the DOM, and `VirtualList` in `@effect/ui-native/kit`
 * with native views, so apps use one of those rather than this module.
 *
 * Offsets and sizes are along the scroll axis, in the host's units, and are
 * measured from the start of the first item. `height` is the viewport's size
 * along that axis and `width` its size across it, whichever way the list
 * scrolls.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Schema from "effect/Schema"
import * as UiSchema from "./UiSchema.ts"
import * as UiStruct from "./UiStruct.ts"

const defaultOverscan = 3
const defaultEndThreshold = 1

/**
 * Where a scroll request goes: an item by index or by key, a distance from the
 * start of the list, or the end of the list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollTarget = UiSchema.TaggedEnum({
  Index: { index: Schema.Number },
  Key: { key: Schema.String },
  Offset: { offset: Schema.Number },
  End: {}
})

/**
 * Where a scroll request goes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollTarget = typeof ScrollTarget.Type

/**
 * Where an item a scroll request goes to ends up in the viewport.
 * `"nearest"` leaves an item that is in full view where it is, and otherwise
 * brings in its nearest edge.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Align = Schema.Literals(["start", "center", "end", "nearest"])

/**
 * Where an item a scroll request goes to ends up in the viewport.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Align = typeof Align.Type

/**
 * A scroll request. A list scrolls once for each request that differs from
 * the last one it received, so change `id` to go to the same target again.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollTo = Schema.Struct({
  target: ScrollTarget,
  /** Where an item ends up. `"start"` when omitted, and unused for an offset or the end. */
  align: Schema.optional(Align),
  /** Tells apart two requests for the same target. */
  id: Schema.optional(Schema.Union([Schema.String, Schema.Number]))
})

/**
 * A scroll request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollTo = typeof ScrollTo.Type

/**
 * The props every virtual list takes. A kit adds the props of its host.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Props = Schema.Struct({
  /** How many items the list has. Ignored when `keys` is passed, which has one key per item. 0 when omitted. */
  count: Schema.optional(Schema.Number),
  /** The size of an item along the scroll axis until it's measured, or always with `measure: false`. */
  itemSize: Schema.Number,
  /** The size of each item by index, in place of `itemSize`. */
  sizes: Schema.optional(Schema.Array(Schema.Number)),
  /** Whether to measure the rendered items. `true` when omitted. */
  measure: Schema.optional(Schema.Boolean),
  /**
   * A stable key for each item by index, which also sets how many items the
   * list has. Sizes are kept by key, a scroll request can name an item by
   * key, and items added or removed before the visible ones leave them in
   * place.
   */
  keys: Schema.optional(Schema.Array(Schema.String)),
  /**
   * How many rows to render on each side of the visible ones. After a
   * scroll, the list also renders as far ahead as that scroll moved, up to
   * the viewport's size.
   */
  overscan: Schema.optional(Schema.Number),
  /** How many items to render before the viewport is known. One row and the overscan when omitted. */
  initialCount: Schema.optional(Schema.Number),
  /** A name for the items, such as the search they answer. The list drops what it measured when it changes. */
  dataset: Schema.optional(Schema.String),
  /**
   * Scrolls to a target once it's rendered, and again for each request that
   * differs from the last. A request waits for its target until a newer one
   * replaces it or the user scrolls.
   */
  scrollTo: Schema.optional(ScrollTo),
  /**
   * Keeps the end of the list in view as it grows or resizes while the user
   * is within `threshold` of it, 1 when omitted.
   */
  followEnd: Schema.optional(
    Schema.Union([
      Schema.Boolean,
      Schema.Struct({ threshold: Schema.optional(Schema.Number) })
    ])
  ),
  /**
   * Space held before the first item for items still to load before it, such
   * as older messages, so scrolling back doesn't stop at the start while they
   * load. 0 when omitted.
   */
  reserveStart: Schema.optional(Schema.Number),
  /**
   * The indices of the items that stick to the start of the viewport, such as
   * section headers. The last one at or before the viewport's start stays
   * rendered at its own offset wherever the list scrolls.
   */
  sticky: Schema.optional(Schema.Array(Schema.Number)),
  /**
   * How the items are placed. `"flow"` leaves them in the list's own layout,
   * in rows of one or more lanes with a gap between rows. `"absolute"` places
   * each at its offset in a single lane, with no gap. `"flow"` when omitted.
   */
  layout: Schema.optional(Schema.Literals(["flow", "absolute"])),
  /**
   * Emits `Scrolled` each time the scroll offset, the viewport's size or the
   * list's length changes, and not only when the visible items, an edge or
   * `scrolling` does. `false` when omitted.
   */
  trackScroll: Schema.optional(Schema.Boolean)
})

/**
 * The props every virtual list takes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Props = typeof Props.Type

const Visible = Schema.Struct({
  first: Schema.Number,
  last: Schema.Number,
  atStart: Schema.Boolean,
  atEnd: Schema.Boolean
})

const Tracked = Schema.Struct({
  offset: Schema.Number,
  height: Schema.Number,
  length: Schema.Number
})

type Tracked = typeof Tracked.Type

const Scrolled = Schema.Struct({
  ...Visible.fields,
  ...Tracked.fields,
  scrolling: Schema.Boolean
})

type Scrolled = typeof Scrolled.Type

/**
 * The events of a virtual list.
 *
 * **Details**
 *
 * `Scrolled` reports `first` and `last`, the first and last visible items,
 * `atStart` and `atEnd`, whether the list is scrolled to its start and to
 * its end, and `scrolling`, whether it's scrolling. It also reports
 * `offset`, how far the viewport's start is past the start of the first
 * item, in the units of an `Offset` scroll target, `height`, the viewport's
 * size, and `length`, the list's size from the start of its first item.
 *
 * It's emitted when `first`, `last`, `atStart`, `atEnd` or `scrolling`
 * changes, and with `trackScroll` also when `offset`, `height` or `length`
 * does.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Events = UiSchema.TaggedEnum({ Scrolled: Scrolled.fields })

/**
 * The events of a virtual list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Events = typeof Events.Type

/**
 * An item by index, and by key when the list has `keys`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ItemRef = Schema.Struct({
  index: Schema.Number,
  key: Schema.NullOr(Schema.String)
})

/**
 * An item by index, and by key when the list has `keys`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ItemRef = typeof ItemRef.Type

/**
 * A scroll position as the item at the viewport's start and how far into it
 * the viewport starts, so it holds when the items before it change size.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Position = Schema.Struct({
  ...ItemRef.fields,
  offset: Schema.Number
})

/**
 * A scroll position as an item and an offset into it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Position = typeof Position.Type

/**
 * The state of a virtual list: its scroll position and viewport, the sizes
 * measured so far, the focused item and the latest scroll request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Model = Schema.Struct({
  position: Schema.NullOr(Position),
  height: Schema.Number,
  atStart: Schema.Boolean,
  atEnd: Schema.Boolean,
  overflowing: Schema.Boolean,
  lanes: Schema.Number,
  gap: Schema.Number,
  width: Schema.Number,
  sizes: Schema.Record(Schema.String, Schema.Number),
  dataset: Schema.NullOr(Schema.String),
  epoch: Schema.Number,
  focused: Schema.NullOr(ItemRef),
  scroll: Schema.NullOr(
    Schema.Struct({ scrollTo: ScrollTo, done: Schema.Boolean })
  ),
  offset: Schema.Number,
  length: Schema.Number,
  scrolling: Schema.Boolean,
  announced: Schema.NullOr(Scrolled),
  lead: Schema.Number
})

/**
 * The state of a virtual list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Model = typeof Model.Type

/**
 * A rendered item as its host measured it: `top` and `size` along the scroll
 * axis from the start of the first item, and `left` across it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const MeasuredItem = Schema.Struct({
  ...ItemRef.fields,
  top: Schema.Number,
  left: Schema.Number,
  size: Schema.Number
})

/**
 * A rendered item as its host measured it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MeasuredItem = typeof MeasuredItem.Type

/**
 * What a host reports to a virtual list.
 *
 * **Details**
 *
 * - `MovedViewport`: the viewport's start, size and edges, the item at its
 *   start when the host knows it, and the request the host has just scrolled
 *   to, if any.
 * - `RequestedScroll`: a request taken from `scrollTo`, so it's kept after
 *   the prop is dropped.
 * - `ScrolledByUser`: the user scrolled, which drops a waiting request.
 * - `MeasuredItems`: the sizes of rendered items, for the `epoch` they were
 *   rendered in, and the width they were laid out at. A new width drops the
 *   sizes measured before.
 * - `FocusedItem` and `BlurredItems`: the item that holds the focus, which
 *   stays rendered.
 * - `ScrolledViewport`: the scroll offset, viewport size and length, and
 *   whether a scroll is going on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Message = UiSchema.TaggedEnum({
  MovedViewport: {
    start: Schema.Number,
    height: Schema.Number,
    anchor: Schema.NullOr(Position),
    atStart: Schema.Boolean,
    atEnd: Schema.Boolean,
    overflowing: Schema.Boolean,
    length: Schema.Number,
    scrolled: Schema.NullOr(ScrollTo)
  },
  RequestedScroll: { scrollTo: ScrollTo },
  ScrolledByUser: {},
  MeasuredItems: {
    epoch: Schema.Number,
    width: Schema.Number,
    items: Schema.Array(MeasuredItem)
  },
  FocusedItem: ItemRef.fields,
  BlurredItems: {},
  ScrolledViewport: { ...Tracked.fields, scrolling: Schema.Boolean }
})

/**
 * What a host reports to a virtual list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Message = typeof Message.Type

/**
 * A scroll request with its target resolved: the item's index, or the
 * offset. Both are `null` for the end.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollRequest = Schema.Struct({
  scrollTo: ScrollTo,
  index: Schema.NullOr(Schema.Number),
  offset: Schema.NullOr(Schema.Number)
})

/**
 * A scroll request with its target resolved.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollRequest = typeof ScrollRequest.Type

/**
 * The span of offsets a row covers. `start` is `null` for the first row and
 * `end` for the last, since they reach past the list's edges.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const Bounds = Schema.NullOr(
  Schema.Struct({
    start: Schema.NullOr(Schema.Number),
    end: Schema.NullOr(Schema.Number)
  })
)

/**
 * The span of offsets a row covers.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Bounds = typeof Bounds.Type

/**
 * Whether `offset` falls within `bounds`, give or take half a unit.
 *
 * @stability experimental
 * @category predicates
 * @since 0.1.0
 */
export const within = (bounds: Bounds, offset: number): boolean =>
  bounds !== null && (bounds.start === null || offset >= bounds.start - 0.5) &&
  (bounds.end === null || offset < bounds.end + 0.5)

/**
 * Whether two scroll requests are the same.
 *
 * @stability experimental
 * @category predicates
 * @since 0.1.0
 */
export const sameScrollTo: (a: ScrollTo, b: ScrollTo) => boolean = Schema
  .toEquivalence(ScrollTo)

const sameVisible = Schema.toEquivalence(Visible)

const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.5

const sameTracked = (a: Tracked, b: Tracked): boolean =>
  same(a.offset, b.offset) && same(a.height, b.height) &&
  same(a.length, b.length)

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const countOf = (props: Props): number =>
  props.keys === undefined
    ? Math.max(0, Math.floor(props.count ?? 0))
    : props.keys.length

/**
 * The key of the item at `index`, or `null` when the list has no `keys`.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const keyOf = (props: Props, index: number): string | null =>
  props.keys?.[index] ?? null

const sizeKey = (props: Props, index: number): string =>
  keyOf(props, index) ?? String(index)

/**
 * How close to the end counts as at the end while `followEnd` is on, or
 * `null` when it's off.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const endThreshold = (props: Props): number | null =>
  props.followEnd === undefined || props.followEnd === false
    ? null
    : props.followEnd === true
    ? defaultEndThreshold
    : props.followEnd.threshold ?? defaultEndThreshold

/**
 * How close to an edge counts as at it when `followEnd` doesn't say.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const edgeThreshold = defaultEndThreshold

const current = <M extends Model>(model: M, props: Props): M => {
  const dataset = props.dataset ?? null
  return dataset === model.dataset
    ? model
    : { ...model, dataset, sizes: {}, focused: null, epoch: model.epoch + 1 }
}

const resolve = (
  props: Props,
  ref: ItemRef,
  fallback: boolean
): number | null => {
  const count = countOf(props)
  if (ref.key !== null) {
    const at = props.keys?.indexOf(ref.key) ?? -1
    if (at >= 0) return at
    if (!fallback) return null
  }
  return count === 0 ? null : clamp(Math.floor(ref.index), 0, count - 1)
}

interface Layout {
  readonly count: number
  readonly lanes: number
  readonly gap: number
  readonly rows: number
  readonly offsets: ReadonlyArray<number>
  readonly total: number
}

interface Cached {
  readonly layout: Layout
  readonly props: Props
}

// The offsets only change with the sizes, so they're kept for the sizes
// object they were computed from.
const layouts = new WeakMap<object, Cached>()

const layoutOf = (model: Model, props: Props): Layout => {
  const count = countOf(props)
  const flow = props.layout !== "absolute"
  const lanes = flow ? Math.max(1, model.lanes) : 1
  const gap = flow ? model.gap : 0
  const measured = props.measure !== false
  const cached = layouts.get(model.sizes)
  if (
    cached !== undefined && cached.layout.count === count &&
    cached.layout.lanes === lanes && cached.layout.gap === gap &&
    cached.props.itemSize === props.itemSize &&
    cached.props.sizes === props.sizes && cached.props.keys === props.keys &&
    (cached.props.measure !== false) === measured
  ) return cached.layout
  const rows = Math.ceil(count / lanes)
  const known = measured ? Object.values(model.sizes) : []
  const estimate = known.length === 0
    ? props.itemSize
    : known.reduce((sum, size) => sum + size, 0) / known.length
  const offsets = [0]
  for (let row = 0; row < rows; row++) {
    let size = 0
    for (
      let index = row * lanes;
      index < Math.min(count, (row + 1) * lanes);
      index++
    ) {
      const given = props.sizes?.[index]
      const item = measured
        ? model.sizes[sizeKey(props, index)] ?? given ?? estimate
        : given ?? props.itemSize
      size = Math.max(size, item)
    }
    offsets.push(offsets[row]! + size + gap)
  }
  const layout = {
    count,
    lanes,
    gap,
    rows,
    offsets,
    total: rows === 0 ? 0 : offsets[rows]! - gap
  }
  layouts.set(model.sizes, { layout, props })
  return layout
}

const rowAt = (layout: Layout, y: number): number => {
  let low = 0
  let high = Math.max(0, layout.rows - 1)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (layout.offsets[middle]! <= y) low = middle
    else high = middle - 1
  }
  return low
}

const rowOf = (layout: Layout, index: number): number =>
  Math.floor(index / layout.lanes)

interface Band {
  readonly start: number
  readonly end: number
}

const restingBand = (
  model: Model,
  props: Props,
  layout: Layout
): Band | null => {
  if (model.position === null || layout.rows === 0) return null
  if (endThreshold(props) !== null && model.atEnd) {
    return { start: layout.total - model.height, end: layout.total }
  }
  const index = resolve(props, model.position, true) ?? 0
  const start = layout.offsets[rowOf(layout, index)]! + model.position.offset
  return { start, end: start + model.height }
}

const sameRequest = (
  a: ScrollTo | undefined,
  b: ScrollTo | null
): boolean => a !== undefined && b !== null && sameScrollTo(a, b)

const latestOf = (model: Model): ScrollTo | null =>
  model.scroll?.scrollTo ?? null

const waitingOf = (model: Model): ScrollTo | null =>
  model.scroll === null || model.scroll.done ? null : model.scroll.scrollTo

const freshOf = (model: Model, props: Props): ScrollTo | null =>
  props.scrollTo === undefined || sameRequest(props.scrollTo, latestOf(model))
    ? null
    : props.scrollTo

const pendingOf = (
  scrollTo: ScrollTo | null,
  props: Props,
  layout: Layout
): ScrollRequest | null => {
  if (scrollTo === null || layout.count === 0) return null
  const target = scrollTo.target
  switch (target._tag) {
    case "Index":
      return {
        scrollTo,
        index: clamp(Math.floor(target.index), 0, layout.count - 1),
        offset: null
      }
    case "Key": {
      const index = resolve(props, { index: -1, key: target.key }, false)
      return index === null ? null : { scrollTo, index, offset: null }
    }
    case "Offset":
      return { scrollTo, index: null, offset: Math.max(0, target.offset) }
    case "End":
      return { scrollTo, index: null, offset: null }
  }
}

/**
 * Where the viewport starts to show the span from `top` to `bottom` as
 * `align` says, given that it starts at `view` and is `height` long.
 *
 * @stability experimental
 * @category utils
 * @since 0.1.0
 */
export const alignedStart = (
  top: number,
  bottom: number,
  view: number,
  height: number,
  align: Align
): number =>
  align === "start"
    ? top
    : align === "end"
    ? bottom - height
    : align === "center"
    ? (top + bottom - height) / 2
    : top < view
    ? top
    : bottom > view + height
    ? Math.min(bottom - height, top)
    : view

const pendingBand = (
  model: Model,
  layout: Layout,
  pending: ScrollRequest,
  resting: Band | null
): Band => {
  const height = model.height
  let start: number
  if (pending.index !== null) {
    const row = rowOf(layout, pending.index)
    const top = layout.offsets[row]!
    const bottom = layout.offsets[row + 1]! - layout.gap
    start = alignedStart(
      top,
      bottom,
      resting?.start ?? 0,
      height,
      pending.scrollTo.align ?? "start"
    )
  } else {
    start = pending.offset ?? layout.total - height
  }
  return { start, end: start + height }
}

const visibleRows = (
  layout: Layout,
  band: Band | null
): readonly [number, number] | null =>
  band === null || layout.rows === 0
    ? null
    : [
      rowAt(layout, band.start),
      rowAt(layout, Math.max(band.start, band.end - 1))
    ]

const visibleItems = (
  layout: Layout,
  band: Band | null
): readonly [number, number] | null => {
  const rows = visibleRows(layout, band)
  return rows === null
    ? null
    : [
      rows[0] * layout.lanes,
      Math.min(layout.count, (rows[1] + 1) * layout.lanes) - 1
    ]
}

// The last sticky item at or before the viewport's start.
const stickyOf = (
  props: Props,
  layout: Layout,
  band: Band | null
): number | null => {
  let found: number | null = null
  for (const index of props.sticky ?? []) {
    if (
      index >= 0 && index < layout.count && (found === null || index > found) &&
      layout.offsets[rowOf(layout, index)]! <= (band?.start ?? 0)
    ) found = index
  }
  return found
}

// Adds a range of rows to keep rendered, merged with any it touches.
const keep = (
  rows: Array<[number, number]>,
  kept: [number, number]
): void => {
  let at = 0
  while (at < rows.length && rows[at]![1] < kept[0]) at++
  while (at < rows.length && rows[at]![0] <= kept[1]) {
    const [start, end] = rows.splice(at, 1)[0]!
    kept = [Math.min(start, kept[0]), Math.max(end, kept[1])]
  }
  rows.splice(at, 0, kept)
}

interface Window {
  readonly ranges: ReadonlyArray<readonly [number, number]>
  readonly before: number
  readonly after: number
  readonly gaps: ReadonlyArray<number>
  readonly visible: readonly [number, number] | null
}

const windowOf = (
  model: Model,
  props: Props,
  layout: Layout,
  band: Band | null,
  lead: number
): Window => {
  const overscan = Math.max(0, Math.floor(props.overscan ?? defaultOverscan))
  const visible = visibleRows(layout, band)
  const ahead = band === null ? null : visibleRows(layout, {
    start: band.start + Math.min(0, lead),
    end: band.end + Math.max(0, lead)
  })
  let startRow = 0
  let endRow = ahead === null
    ? props.initialCount === undefined
      ? overscan + 1
      : Math.ceil(props.initialCount / layout.lanes)
    : ahead[1] + overscan + 1
  if (ahead !== null) startRow = Math.max(0, ahead[0] - overscan)
  endRow = Math.min(layout.rows, endRow)
  startRow = Math.min(startRow, endRow)

  const rows: Array<[number, number]> = [[startRow, endRow]]
  // Keep the focused item rendered, with the rows around it, so focus can
  // move to its neighbours.
  const focused = model.focused === null
    ? null
    : resolve(props, model.focused, true)
  if (focused !== null) {
    const row = rowOf(layout, focused)
    keep(rows, [Math.max(0, row - 1), Math.min(layout.rows, row + 2)])
  }
  const sticky = stickyOf(props, layout, band)
  if (sticky !== null) {
    const row = rowOf(layout, sticky)
    keep(rows, [row, row + 1])
  }
  const last = rows[rows.length - 1]![1]
  return {
    ranges: rows.map(([start, end]) =>
      [
        start * layout.lanes,
        Math.min(layout.count, end * layout.lanes)
      ] as const
    ),
    before: layout.offsets[rows[0]![0]]!,
    after: last >= layout.rows
      ? 0
      : layout.offsets[layout.rows]! - layout.offsets[last]!,
    gaps: rows.slice(1).map(([start], i) =>
      layout.offsets[start]! - layout.offsets[rows[i]![1]]!
    ),
    visible
  }
}

const boundsOf = (layout: Layout, row: number): Bounds => ({
  start: row === 0 ? null : layout.offsets[row]!,
  end: row >= layout.rows - 1 ? null : layout.offsets[row + 1]!
})

const lanesOf = (items: ReadonlyArray<MeasuredItem>): number => {
  const lefts = items.map((item) => item.left).sort((a, b) => a - b)
  return lefts.filter((left, i) => i === 0 || !same(left, lefts[i - 1]!)).length
}

const measured = <M extends Model>(
  model: M,
  props: Props,
  { epoch, items, width }: typeof Message.cases.MeasuredItems.Type
): M => {
  if (epoch !== model.epoch || width === 0) return model
  let { gap, lanes } = model
  let reset = model.width !== 0 && !same(width, model.width)
  let changed = reset || model.width === 0
  const count = countOf(props)
  const flow = props.layout !== "absolute"
  const found = lanesOf(items)
  const lanesChanged = flow && items.length > 0 && found !== lanes &&
    (found < items.length || found > lanes)
  if (lanesChanged) {
    lanes = found
    reset = changed = true
  }
  const fresh = props.measure === false ? [] : items.filter((item) => {
    const known = reset
      ? undefined
      : model.sizes[item.key ?? String(item.index)]
    return known === undefined || !same(known, item.size)
  })
  let sizes: Model["sizes"] = reset ? {} : model.sizes
  if (fresh.length > 0) {
    sizes = {
      ...sizes,
      ...Object.fromEntries(
        fresh.map((item) => [item.key ?? String(item.index), item.size])
      )
    }
    changed = true
  }
  if (flow && !lanesChanged) {
    const rows = new Map<number, { top: number; bottom: number }>()
    for (const item of items) {
      const index = Math.floor(item.index / lanes)
      const row = rows.get(index)
      if (row === undefined) {
        rows.set(index, { top: item.top, bottom: item.top + item.size })
      } else {
        row.top = Math.min(row.top, item.top)
        row.bottom = Math.max(row.bottom, item.top + item.size)
      }
    }
    for (const [index, row] of rows) {
      const above = rows.get(index - 1)
      if (above === undefined) continue
      const measuredGap = Math.max(0, row.top - above.bottom)
      if (!same(measuredGap, gap)) {
        gap = measuredGap
        changed = true
      }
      break
    }
  }
  if (!changed) return model
  if (props.keys !== undefined && Object.keys(sizes).length > 2 * count + 64) {
    const live = new Set(props.keys)
    sizes = Object.fromEntries(
      Object.entries(sizes).filter(([key]) => live.has(key))
    )
  }
  return {
    ...model,
    gap,
    lanes,
    width,
    sizes,
    epoch: reset ? model.epoch + 1 : model.epoch
  }
}

/**
 * A Model after an update, and the events to emit.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Updated<M extends Model> {
  readonly model: M
  readonly events: ReadonlyArray<Events>
}

const none: ReadonlyArray<Events> = []

const announce = <M extends Model>(
  next: M,
  props: Props,
  layout = layoutOf(next, props)
): Updated<M> => {
  const visible = visibleItems(layout, restingBand(next, props, layout))
  if (visible === null) return { model: next, events: none }
  const announced = {
    first: visible[0],
    last: visible[1],
    atStart: next.atStart,
    atEnd: next.atEnd,
    offset: next.offset,
    height: next.height,
    length: next.length,
    scrolling: next.scrolling
  }
  return next.announced !== null && sameVisible(next.announced, announced) &&
      next.announced.scrolling === announced.scrolling &&
      (props.trackScroll !== true || sameTracked(next.announced, announced))
    ? { model: next, events: none }
    : { model: { ...next, announced }, events: [Events.Scrolled(announced)] }
}

/**
 * The Model of a list that hasn't been laid out yet.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const init = (props: Props): Model => ({
  position: null,
  height: 0,
  atStart: false,
  atEnd: false,
  overflowing: false,
  lanes: 1,
  gap: 0,
  width: 0,
  sizes: {},
  dataset: props.dataset ?? null,
  epoch: 0,
  focused: null,
  scroll: props.scrollTo === undefined
    ? null
    : { scrollTo: props.scrollTo, done: false },
  offset: 0,
  length: 0,
  scrolling: false,
  announced: null,
  lead: 0
})

/**
 * A Model restored from history: what was measured and the position, without
 * the focus or a scroll in progress.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const restore = <M extends Model>(model: M): M => ({
  ...model,
  focused: null,
  lead: 0,
  scrolling: false
})

/**
 * Applies a message to the Model, keeping any fields a kit adds to it.
 *
 * @stability experimental
 * @category updates
 * @since 0.1.0
 */
export const update = <M extends Model>(
  stored: M,
  props: Props,
  message: Message
): Updated<M> => {
  switch (message._tag) {
    case "MovedViewport": {
      const {
        anchor,
        atEnd,
        atStart,
        height,
        length,
        overflowing,
        scrolled,
        start
      } = message
      const model = current(stored, props)
      const layout = layoutOf(model, props)
      const row = rowAt(layout, start)
      const position = anchor ?? {
        index: row * layout.lanes,
        key: keyOf(props, row * layout.lanes),
        offset: start - (layout.offsets[row] ?? 0)
      }
      const before = restingBand(model, props, layout)
      const moved = scrolled === null && before !== null
        ? start - before.start
        : 0
      return announce(
        {
          ...model,
          position,
          height,
          atStart,
          atEnd,
          overflowing,
          offset: start,
          length,
          lead: Math.abs(moved) <= height ? moved : 0,
          scroll: scrolled === null
            ? model.scroll
            : { scrollTo: scrolled, done: true }
        },
        props,
        layout
      )
    }
    case "RequestedScroll":
      return {
        model: sameRequest(message.scrollTo, latestOf(stored))
          ? stored
          : { ...stored, scroll: { scrollTo: message.scrollTo, done: false } },
        events: none
      }
    case "ScrolledByUser":
      return {
        model: stored.scroll === null || stored.scroll.done
          ? stored
          : {
            ...stored,
            scroll: UiStruct.evolve(stored.scroll, { done: true })
          },
        events: none
      }
    case "MeasuredItems": {
      const model = current(stored, props)
      const next = measured(model, props, message)
      return next === model
        ? { model: stored, events: none }
        : announce(next, props)
    }
    case "FocusedItem":
      return {
        model: {
          ...current(stored, props),
          focused: { index: message.index, key: message.key }
        },
        events: none
      }
    case "BlurredItems":
      return {
        model: { ...current(stored, props), focused: null },
        events: none
      }
    case "ScrolledViewport": {
      const { height, length, offset, scrolling } = message
      return announce(
        { ...current(stored, props), offset, height, length, scrolling },
        props
      )
    }
  }
}

/**
 * What a host draws for a list: the items to render, the space to leave for
 * the others, and the scroll request to apply.
 *
 * **Details**
 *
 * - `items`: the indices to render, in order, made of `ranges` of indices
 *   from `start` up to `end`. There's one range around the viewport, and
 *   more for the focused item and the active `sticky` item when they're
 *   outside it.
 * - `before`, `gaps` and `after`: the space before the first range,
 *   between each range and the one before it, and after the last.
 * - `total`: the list's length.
 * - `first` and `last`: the offsets the first and last visible rows cover.
 *   While the viewport's start and end stay within them, the same items are
 *   visible.
 * - `fresh`: a `scrollTo` prop the Model hasn't recorded yet, to send back
 *   as `RequestedScroll`.
 * - `request`: the request to scroll to, resolved, and `target`, where it
 *   puts the viewport's start. `waiting` is `true` while a request is
 *   waiting, even one whose item isn't in the list yet.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plan {
  readonly epoch: number
  readonly count: number
  readonly lanes: number
  readonly gap: number
  readonly total: number
  readonly items: Array<number>
  readonly ranges: ReadonlyArray<readonly [number, number]>
  readonly before: number
  readonly gaps: ReadonlyArray<number>
  readonly after: number
  readonly first: Bounds
  readonly last: Bounds
  readonly fresh: ScrollTo | null
  readonly request: ScrollRequest | null
  readonly target: number | null
  readonly waiting: boolean
  /** The offset of the row that holds the item at `index`. */
  readonly offsetOf: (index: number) => number
}

/**
 * Works out what to render for a Model and the props.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const plan = (stored: Model, props: Props): Plan => {
  const model = current(stored, props)
  const layout = layoutOf(model, props)
  const resting = restingBand(model, props, layout)
  const fresh = freshOf(model, props)
  const waiting = fresh ?? waitingOf(model)
  const request = pendingOf(waiting, props, layout)
  const band = request === null
    ? resting
    : pendingBand(model, layout, request, resting)
  const { after, before, gaps, ranges, visible } = windowOf(
    model,
    props,
    layout,
    band,
    request === null ? model.lead : 0
  )
  return {
    epoch: model.epoch,
    count: layout.count,
    lanes: layout.lanes,
    gap: layout.gap,
    total: layout.total,
    items: ranges.flatMap(([start, end]) =>
      Array.from({ length: end - start }, (_, i) => start + i)
    ),
    ranges,
    before,
    gaps,
    after,
    first: visible === null ? null : boundsOf(layout, visible[0]),
    last: visible === null ? null : boundsOf(layout, visible[1]),
    fresh,
    request,
    target: request === null ? null : band!.start,
    waiting: waiting !== null,
    offsetOf: (index) => layout.offsets[rowOf(layout, index)]!
  }
}

/**
 * Where a request puts the viewport's start, as `plan`'s `target` does for
 * the waiting one, or `null` when its item isn't in the list.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const targetOf = (
  stored: Model,
  props: Props,
  scrollTo: ScrollTo
): number | null => {
  const model = current(stored, props)
  const layout = layoutOf(model, props)
  const request = pendingOf(scrollTo, props, layout)
  return request === null
    ? null
    : pendingBand(model, layout, request, restingBand(model, props, layout))
      .start
}
