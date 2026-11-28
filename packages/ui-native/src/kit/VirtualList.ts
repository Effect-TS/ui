/**
 * A scroll view that renders only the items near what's on screen, and
 * leaves room for the others so the scroll covers the whole list. It covers
 * what React Native's `FlatList`, `SectionList` and `VirtualizedList` do.
 *
 * `VirtualList` is a headless component on the same core as `VirtualList` in
 * `@effect/ui-kit` (`@effect/ui/Virtualizer`), so the two take the same
 * props and emit the same `Scrolled`. Your view draws a `scroll` and one
 * element for each index in `items`.
 *
 * **Anatomy**
 *
 * | Part | Element |
 * | :-- | :-- |
 * | `list` | `scroll`, the view that scrolls |
 * | `item` | `view`, one item |
 *
 * `item` takes `{ element, index }`. Draw one for each index in `items`, in
 * order, as children of `list`, and key each element by the item's own id.
 * Other children of `list`, such as a header, a footer, an empty state or a
 * `RefreshControl`, stay where they're written. The list adds keyed empty
 * views among its children that stand in for the items left out.
 *
 * **Sizes**
 *
 * An item is `itemSize` points along the scroll axis, or `sizes[index]`,
 * until its `layout` reports its size. With `measure: false` those sizes are
 * exact and the list sets each item's `height`, or `width` when it's
 * `horizontal`. Put the space between items in their padding or in a child:
 * an item's margin isn't measured.
 *
 * **Scrolling**
 *
 * The list renders the first `initialCount` items, 10 when omitted, until
 * the scroll has laid out, or the items around a `scrollTo` target.
 * `scrollTo` scrolls without animation once the scroll has laid out, and
 * again as measured sizes move its target, until the user drags. While items
 * are measured or `keys` are passed, the scroll keeps the first visible item
 * in place as the items before it change, with
 * `maintainVisibleContentPosition`. `followEnd` scrolls to the end when the
 * content grows while the user is there.
 *
 * `scrolling` turns `true` when a drag begins and `false` when the
 * momentum after it ends, or 100ms after a drag that has none.
 *
 * `sticky` keeps the last sticky item at or before the viewport's start
 * rendered at its own place, such as the header of the section on screen.
 *
 * **Example** (A list of rows)
 *
 * ```ts
 * import { Native } from "@effect/ui-native"
 * import { VirtualList } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const rows = Array.from({ length: 10_000 }, (_, i) => "Row " + i)
 *
 * const Rows = Native.component({
 *   name: "Rows",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) =>
 *     VirtualList(h, {
 *       props: { keys: rows, itemSize: 48 },
 *       view: (list) =>
 *         list.list(h.scroll.style({ flex: 1 })).children(
 *           list.items.map((index) =>
 *             list.item({ element: h.view.key(rows[index]!), index }).children(
 *               h.text.children(rows[index]!)
 *             )
 *           )
 *         )
 *     })
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Virtualizer from "@effect/ui/Virtualizer"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

const scrollEndDelay = 100

const { layout: _layout, ...coreFields } = Virtualizer.Props.fields

/**
 * The props of `VirtualList`: those of `Virtualizer.Props` in points, but
 * `layout`, and `horizontal`, which scrolls the list sideways.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListProps = Schema.Struct({
  ...coreFields,
  horizontal: Schema.optional(Schema.Boolean)
})

/**
 * The props of `VirtualList`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListProps = typeof VirtualListProps.Type

/**
 * The events of `VirtualList`, as `Virtualizer.Events` describes them. The
 * list is at its start while the scroll offset is within a point of 0, and at
 * its end while the content's end is within the `followEnd` threshold of the
 * viewport's, or a point.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListEvents = Virtualizer.Events

/**
 * The events of `VirtualList`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListEvents = Virtualizer.Events

const Model = Schema.Struct({
  ...Virtualizer.Model.fields,
  // What the scroll last reported, along its axis: the offset, the
  // viewport's size, the content's size, -1 until it's known, and the
  // viewport's cross size.
  scrollOffset: Schema.Number,
  viewport: Schema.Number,
  content: Schema.Number,
  cross: Schema.Number,
  // Where the leading spacer starts in the content.
  spacer: Schema.Number,
  // The first rendered item, and where native last laid out its start.
  placed: Schema.NullOr(
    Schema.Struct({
      index: Schema.Number,
      key: Schema.String,
      at: Schema.Number
    })
  ),
  // The offset the list last scrolled to, -1 for the end, and the content's
  // size then.
  aimed: Schema.NullOr(
    Schema.Struct({ to: Schema.Number, content: Schema.Number })
  ),
  // Counts drags, so a settle timer knows when a newer drag began.
  drag: Schema.Number,
  ended: Schema.Boolean,
  momentum: Schema.Boolean
})

type Model = typeof Model.Type

const Message = UiSchema.TaggedEnum({
  LaidOutViewport: { size: Schema.Number, cross: Schema.Number },
  Scrolled: {
    offset: Schema.Number,
    viewport: Schema.Number,
    content: Schema.Number
  },
  ResizedContent: { content: Schema.Number },
  PlacedSpacer: { at: Schema.Number },
  LaidOutItem: {
    epoch: Schema.Number,
    index: Schema.Number,
    key: Schema.NullOr(Schema.String),
    at: Schema.Number,
    size: Schema.Number,
    first: Schema.Boolean
  },
  Requested: { scrollTo: Virtualizer.ScrollTo },
  DragBegan: {},
  DragEnded: {},
  MomentumBegan: {},
  MomentumEnded: {},
  Settled: { drag: Schema.Number }
})

type Message = typeof Message.Type

const Root = Native.ref("VirtualList")

const withRoot = (
  f: (host: Native.Host["Service"], node: NativeNode) => void
) =>
  Effect.flatMap(
    Renderer.Refs.use((refs) => refs.lookup(Root)),
    (node) =>
      Native.Host.useSync((host) => {
        if (Option.isSome(node)) f(host, node.value)
        return Component.noop
      })
  )

const ScrollList = Command.make(
  "VirtualList.scrollTo",
  { args: { offset: Schema.Number, horizontal: Schema.Boolean } },
  ({ horizontal, offset }) =>
    withRoot((host, node) =>
      horizontal
        ? host.scrollTo(node, offset, 0, false)
        : host.scrollTo(node, 0, offset, false)
    )
)

const ScrollEnd = Command.make(
  "VirtualList.scrollToEnd",
  { args: {} },
  () => withRoot((host, node) => host.scrollToEnd(node, false))
)

const coreOf = (props: VirtualListProps): Virtualizer.Props => ({
  ...props,
  initialCount: props.initialCount ?? 10,
  // At least one row before the viewport, so the leading spacer never
  // becomes the view the scroll keeps in place.
  overscan: Math.max(1, Math.floor(props.overscan ?? 3))
})

const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.5

const sizeKey = (props: Virtualizer.Props, index: number): string =>
  Virtualizer.keyOf(props, index) ?? String(index)

const originOf = (model: Model, props: VirtualListProps): number =>
  model.spacer + Math.max(0, props.reserveStart ?? 0)

const atEndOf = (model: Model, core: Virtualizer.Props): boolean =>
  model.content >= 0 &&
  model.content - model.scrollOffset - model.viewport <=
    (Virtualizer.endThreshold(core) ?? Virtualizer.edgeThreshold)

// Whether native keeps the first visible item in place as the content
// above it changes.
const anchoredOf = (props: VirtualListProps): boolean =>
  props.measure !== false || props.keys !== undefined

// The range around the viewport: the longest, as a sticky item's range is
// one item and native sends no focus.
const mainOf = (plan: Virtualizer.Plan): readonly [number, number] =>
  plan.ranges.reduce((a, b) => b[1] - b[0] > a[1] - a[0] ? b : a)

// The viewport's start in the core's layout. Measured from the first item of
// the range around the viewport where native placed it, since the core's
// estimates for the items before it can change before native lays out the
// spacer they size.
const startOf = (
  model: Model,
  props: VirtualListProps,
  core: Virtualizer.Props,
  plan = Virtualizer.plan(model, core)
): number => {
  const { placed } = model
  const fallback = model.scrollOffset - originOf(model, props)
  if (placed === null) return fallback
  const [from, to] = mainOf(plan)
  let index = placed.index
  if (sizeKey(core, index) !== placed.key) {
    index = from
    while (index < to && sizeKey(core, index) !== placed.key) index++
  }
  // A row outside the range, or gone from the list, has no placement to use.
  return index >= from && index < to
    ? plan.offsetOf(index) + model.scrollOffset - placed.at
    : fallback
}

// Tells the core where the viewport is, once the scroll has laid out. When
// the content changed and native keeps the first visible item in place, the
// offset is from before native moved the scroll, so the item stays the one
// the viewport starts at until the next scroll event.
const moved = (
  model: Model,
  props: VirtualListProps,
  core: Virtualizer.Props,
  kept = false
): Virtualizer.Updated<Model> => {
  if (model.viewport === 0) return { model, events: [] }
  const origin = originOf(model, props)
  return Virtualizer.update(
    model,
    core,
    Virtualizer.Message.MovedViewport({
      start: kept ? model.scrollOffset - origin : startOf(model, props, core),
      height: model.viewport,
      anchor: kept && anchoredOf(props) ? model.position : null,
      atStart: model.scrollOffset <= Virtualizer.edgeThreshold,
      atEnd: atEndOf(model, core),
      overflowing: model.content > model.viewport + 0.5,
      length: Math.max(0, model.content - origin),
      scrolled: null
    })
  )
}

// The scroll the model asks for: to a waiting request's target, or to the
// end when the content grew under a list that follows it.
const aim = (
  model: Model,
  props: VirtualListProps,
  core: Virtualizer.Props,
  follow: boolean
): {
  readonly model: Model
  readonly command:
    | ReturnType<typeof ScrollEnd.make>
    | ReturnType<typeof ScrollList.make>
    | null
} => {
  if (model.viewport === 0) return { model, command: null }
  const plan = Virtualizer.plan(model, core)
  let to: number
  if (plan.waiting && plan.request !== null) {
    to = plan.request.scrollTo.target._tag === "End"
      ? -1
      : Math.max(0, Math.round(originOf(model, props) + plan.target!))
  } else if (follow) to = -1
  else return { model, command: null }
  const reached = to === -1
    ? atEndOf(model, core)
    : same(model.scrollOffset, to)
  if (
    model.aimed !== null && model.aimed.to === to &&
    (reached || same(model.aimed.content, model.content))
  ) return { model, command: null }
  return {
    model: { ...model, aimed: { to, content: model.content } },
    command: to === -1
      ? ScrollEnd.make()
      : ScrollList.make({ offset: to, horizontal: props.horizontal === true })
  }
}

type Update = Component.Update<
  Model,
  Message,
  VirtualListEvents,
  VirtualListProps
>

const finish = (
  $: Update,
  { events, model }: Virtualizer.Updated<Model>,
  follow = false
) => {
  const core = coreOf($.props)
  const { command, model: next } = aim(model, $.props, core, follow)
  const step = next === $.model ? $ : $.set(next)
  const emitted = events.length === 0 ? step : step.emit(...events)
  return command === null ? emitted : emitted.run(command)
}

const scrolling = (
  model: Model,
  core: Virtualizer.Props,
  on: boolean
): Virtualizer.Updated<Model> =>
  model.scrolling === on ? { model, events: [] } : Virtualizer.update(
    model,
    core,
    Virtualizer.Message.ScrolledViewport({
      offset: model.offset,
      height: model.height,
      length: model.length,
      scrolling: on
    })
  )

const freshOf = (
  model: Model,
  props: VirtualListProps
): Virtualizer.ScrollTo | null =>
  props.scrollTo === undefined ||
    (model.scroll !== null &&
      Virtualizer.sameScrollTo(props.scrollTo, model.scroll.scrollTo))
    ? null
    : props.scrollTo

type ItemOf<B extends View.PartTarget<"view">> = ReturnType<B["attr"]>

/**
 * A headless virtual list. Call it with the consumer's `h`, its `props`, and
 * a `view` closure that applies `list` to a `scroll` and `item` to the
 * element of each index in `items`.
 *
 * **Details**
 *
 * The parts object also carries `items`, the indices to render in order,
 * `count`, `atStart`, `atEnd` and `scrolling`.
 *
 * `list` sets the scroll's `layout`, `scroll`, `contentSizeChange` and drag
 * and momentum handlers, `horizontal`, and `maintainVisibleContentPosition`
 * while items are measured or `keys` are passed. `item` sets a `layout`
 * handler, or with `measure: false` the item's size.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const VirtualList = Native.component({
  name: "VirtualList",
  props: VirtualListProps,
  model: Model,
  message: Message,
  events: VirtualListEvents,
  restore: false
}).make({
  init: ($) => ({
    ...Virtualizer.init(coreOf($.props)),
    // Native reports an item's layout only when it changes, so the core's
    // reset of every size at a new cross size would lose sizes that are never
    // reported again. The core's width stays fixed, and the list drops the
    // sizes of the items it isn't rendering when the cross size changes.
    width: 1,
    scrollOffset: 0,
    viewport: 0,
    content: -1,
    cross: 0,
    spacer: 0,
    placed: null,
    aimed: null,
    drag: 0,
    ended: false,
    momentum: false
  }),
  update: ($, message) => {
    const { model, props } = $
    const core = coreOf(props)
    switch (message._tag) {
      case "LaidOutViewport": {
        let sizes = model.sizes
        if (model.cross !== 0 && !same(model.cross, message.cross)) {
          const rendered = new Set(
            Virtualizer.plan(model, core).items.map((i) => sizeKey(core, i))
          )
          sizes = Object.fromEntries(
            Object.entries(sizes).filter(([key]) => rendered.has(key))
          )
        }
        return finish(
          $,
          moved(
            { ...model, sizes, viewport: message.size, cross: message.cross },
            props,
            core
          )
        )
      }
      case "Scrolled":
        return finish(
          $,
          moved(
            {
              ...model,
              scrollOffset: message.offset,
              viewport: message.viewport,
              content: message.content
            },
            props,
            core
          )
        )
      case "ResizedContent": {
        const follow = Virtualizer.endThreshold(core) !== null && model.atEnd &&
          model.viewport > 0
        const next = { ...model, content: message.content }
        // Following the end, the list stays at it until the scroll gets there.
        return follow
          ? finish($, { model: next, events: [] }, true)
          : finish($, moved(next, props, core, true))
      }
      case "PlacedSpacer":
        return finish(
          $,
          moved({ ...model, spacer: message.at }, props, core, true)
        )
      case "LaidOutItem": {
        const { at, epoch, first, index, key, size } = message
        return finish(
          $,
          Virtualizer.update(
            first
              ? { ...model, placed: { index, key: key ?? String(index), at } }
              : model,
            core,
            Virtualizer.Message.MeasuredItems({
              epoch,
              width: model.width,
              items: [{
                index,
                key,
                top: at - originOf(model, props),
                left: 0,
                size
              }]
            })
          ),
          Virtualizer.endThreshold(core) !== null && model.atEnd
        )
      }
      case "Requested":
        return finish(
          $,
          Virtualizer.update(
            model,
            core,
            Virtualizer.Message.RequestedScroll({ scrollTo: message.scrollTo })
          )
        )
      case "DragBegan": {
        const dropped = Virtualizer.update(
          model,
          core,
          Virtualizer.Message.ScrolledByUser()
        ).model
        return finish(
          $,
          scrolling({ ...dropped, ended: false, aimed: null }, core, true)
        )
      }
      case "DragEnded":
        return $.set({ ...model, ended: true, drag: model.drag + 1 })
      case "MomentumBegan":
        return $.set({ ...model, ended: false, momentum: true })
      case "MomentumEnded":
        return finish(
          $,
          scrolling({ ...model, ended: false, momentum: false }, core, false)
        )
      case "Settled":
        return message.drag !== model.drag || model.momentum
          ? $
          : finish($, scrolling({ ...model, ended: false }, core, false))
    }
  },
  subscriptions: ({ model, props }) => {
    const fresh = freshOf(model, props)
    return [
      fresh !== null &&
      Subscription.make(
        "VirtualList.scrollTo",
        JSON.stringify(fresh),
        () => Stream.make(Message.Requested({ scrollTo: fresh }))
      ),
      model.ended && !model.momentum &&
      Subscription.make(
        "VirtualList.settle",
        model.drag,
        (drag) =>
          Stream.fromEffect(
            Effect.as(Effect.sleep(scrollEndDelay), Message.Settled({ drag }))
          )
      )
    ]
  },
  parts: (p, model) => {
    const props = p.props
    const core = coreOf(props)
    const plan = Virtualizer.plan(model, core)
    const horizontal = props.horizontal === true
    const axis = horizontal ? "width" : "height"
    const reserve = Math.max(0, props.reserveStart ?? 0)
    // The space before each range after the first, by its first index.
    const gaps = new Map(
      plan.ranges.slice(1).map(([start], i) => [start, plan.gaps[i]!])
    )
    const anchored = anchoredOf(props)
    const anchor = mainOf(plan)[0]
    const main = (rect: Native.Rect) => horizontal ? rect.x : rect.y
    const length = (
      rect: { readonly width: number; readonly height: number }
    ) => horizontal ? rect.width : rect.height

    const onScroll = (event: Native.ScrollPayload): Message | undefined => {
      const offset = horizontal ? event.x : event.y
      const viewport = length(event)
      const content = horizontal ? event.contentWidth : event.contentHeight
      const next = { ...model, scrollOffset: offset, viewport, content }
      const start = startOf(next, props, core, plan)
      // Most scroll events leave the same items visible and send nothing.
      // A waiting request's plan is around its target, not the viewport, so
      // the scroll that reaches the target is sent.
      return props.trackScroll !== true && plan.request === null &&
          same(viewport, model.viewport) &&
          same(content, model.content) &&
          Virtualizer.within(plan.first, start) &&
          Virtualizer.within(plan.last, start + viewport) &&
          (offset <= Virtualizer.edgeThreshold) === model.atStart &&
          atEndOf(next, core) === model.atEnd
        ? undefined
        : Message.Scrolled({ offset, viewport, content })
    }

    const spacerPart = p.part(
      "view",
      (b) =>
        b.on("layout", ({ layout }) =>
          same(main(layout), model.spacer)
            ? undefined
            : Message.PlacedSpacer({ at: main(layout) }))
    )

    const spacer = (name: string, size: number, placed = false) => {
      const element = new Native.ViewElement<
        never,
        never,
        Native.ViewEvents,
        "view"
      >("view")
        .key("virtual-list:" + name)
        .style({ [axis]: Math.max(0, size) })
      return View.toNode(placed ? spacerPart(element) : element)
    }

    const itemPart = p.part("view", (b, index: number) => {
      if (props.measure === false) {
        const size = props.sizes?.[index] ?? props.itemSize
        return b.forward((node) => node.style({ [axis]: size }))
      }
      const key = Virtualizer.keyOf(core, index)
      const known = model.sizes[key ?? String(index)]
      // The first item around the viewport also reports where it moves to.
      const first = index === anchor
      const { placed } = model
      return b.on("layout", ({ layout }) => {
        const size = length(layout)
        const at = main(layout)
        return known !== undefined && same(known, size) &&
            (!first || (placed !== null && placed.index === index &&
              same(placed.at, at)))
          ? undefined
          : Message.LaidOutItem({
            epoch: plan.epoch,
            index,
            key,
            at,
            size,
            first
          })
      })
    })

    const withSpacers = (
      children: ReadonlyArray<View.Node<any, any>>,
      owner: View.Owner | undefined
    ): ReadonlyArray<View.Node<any, any>> => {
      const out: Array<View.Node<any, any>> = []
      const before = spacer("before", plan.before + reserve, true)
      let k = 0
      for (const child of children) {
        const item = child._tag === "Element" &&
          child.owned?.some((layer) => layer.owner === owner) === true
        if (item) {
          const index = plan.items[k]
          if (k === 0) out.push(before)
          else if (index !== undefined && gaps.has(index)) {
            out.push(spacer("between:" + index, gaps.get(index)!))
          }
          k++
        }
        out.push(child)
        if (item && k === plan.items.length) {
          out.push(spacer("after", plan.after))
        }
      }
      if (k === 0) out.push(before, spacer("after", plan.after))
      return out
    }

    return {
      items: plan.items,
      count: plan.count,
      atStart: model.position !== null && model.atStart,
      atEnd: model.position !== null && model.atEnd,
      scrolling: model.scrolling,
      list: p.part("scroll", (b) =>
        b.ref(Root)
          .on("layout", ({ layout }) =>
            same(length(layout), model.viewport) &&
              same(horizontal ? layout.height : layout.width, model.cross)
              ? undefined
              : Message.LaidOutViewport({
                size: length(layout),
                cross: horizontal ? layout.height : layout.width
              }))
          .on("scroll", onScroll)
          .on("contentSizeChange", (size) =>
            same(length(size), model.content)
              ? undefined
              : Message.ResizedContent({ content: length(size) }))
          .on("scrollBeginDrag", Message.DragBegan())
          .on("scrollEndDrag", Message.DragEnded())
          .on("momentumScrollBegin", Message.MomentumBegan())
          .on("momentumScrollEnd", Message.MomentumEnded())
          .forward((node) => {
            let scroll = horizontal ? node.horizontal() : node
            if (anchored) {
              scroll = scroll.prop("maintainVisibleContentPosition", {
                minIndexForVisible: 0
              })
            }
            const built = View.build(scroll, [])
            const owner = built.owned?.find((layer) =>
              layer.handlers.scroll === onScroll
            )?.owner
            return { ...built, children: withSpacers(built.children, owner) }
          })),
      item: View.wrapPart(
        itemPart,
        <B extends View.PartTarget<"view">>(
          { element, index }: { readonly element: B; readonly index: number }
        ): ItemOf<B> => itemPart(element, index) as ItemOf<B>
      )
    }
  }
})
