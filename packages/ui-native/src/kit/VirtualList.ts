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
  Resolved: {},
  Fixed: {},
  DragBegan: {},
  DragEnded: {},
  MomentumBegan: {},
  MomentumEnded: {},
  Settled: {}
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

// Waits out the momentum that may follow a drag.
const Settle = Command.make(
  "VirtualList.settle",
  { args: {}, mode: "switch" },
  () => Effect.as(Effect.sleep(scrollEndDelay), Message.Settled())
)

// The props with the native defaults, which are also the core's props.
const withDefaults = (props: VirtualListProps): VirtualListProps => ({
  ...props,
  initialCount: props.initialCount ?? 10,
  // At least one row before the viewport, so the leading spacer never
  // becomes the view the scroll keeps in place.
  overscan: Math.max(1, Math.floor(props.overscan ?? 3))
})

const reserveOf = (props: VirtualListProps): number =>
  Math.max(0, props.reserveStart ?? 0)

const originOf = (model: Model, props: VirtualListProps): number =>
  model.spacer + reserveOf(props)

const atEndOf = (
  at: Pick<Model, "scrollOffset" | "viewport" | "content">,
  props: VirtualListProps
): boolean =>
  at.content >= 0 &&
  at.content - at.scrollOffset - at.viewport <=
    (Virtualizer.endThreshold(props) ?? Virtualizer.edgeThreshold)

const following = (model: Model, props: VirtualListProps): boolean =>
  Virtualizer.endThreshold(props) !== null && model.atEnd

// Whether native keeps the first visible item in place as the content
// above it changes.
const anchoredOf = (props: VirtualListProps): boolean =>
  props.measure !== false || props.keys !== undefined

// The start of a viewport scrolled to `offset`, in the core's layout.
// Measured from the first item of the plan's window where native placed it,
// since the core's estimates for the items before it can change before
// native lays out the spacer they size.
const startOf = (
  model: Model,
  props: VirtualListProps,
  offset = model.scrollOffset,
  given?: Virtualizer.Plan
): number => {
  const { placed } = model
  const fallback = offset - originOf(model, props)
  // Native lays fixed rows out as planned, also before `Fixed` arrives.
  if (placed === null || props.measure === false) return fallback
  const plan = given ?? Virtualizer.plan(model, props)
  const [from, to] = plan.window
  let index = placed.index
  if (Virtualizer.sizeKey(props, index) !== placed.key) {
    index = from
    while (index < to && Virtualizer.sizeKey(props, index) !== placed.key) {
      index++
    }
  }
  // A row outside the window, or gone from the list, has no placement to use.
  return index >= from && index < to
    ? plan.offsetOf(index) + offset - placed.at
    : fallback
}

// Tells the core where the viewport is, once the scroll has laid out. When
// the content changed and native keeps the first visible item in place, the
// offset is from before native moved the scroll, so the item stays the one
// the viewport starts at until the next scroll event.
const moved = (
  model: Model,
  props: VirtualListProps,
  kept = false
): Virtualizer.Updated<Model> => {
  if (model.viewport === 0) return { model, events: [] }
  const origin = originOf(model, props)
  return Virtualizer.update(
    model,
    props,
    Virtualizer.Message.MovedViewport({
      start: kept ? model.scrollOffset - origin : startOf(model, props),
      height: model.viewport,
      anchor: kept && anchoredOf(props) ? model.position : null,
      atStart: model.scrollOffset <= Virtualizer.edgeThreshold,
      atEnd: atEndOf(model, props),
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
  follow: boolean
): {
  readonly model: Model
  readonly command:
    | ReturnType<typeof ScrollEnd.make>
    | ReturnType<typeof ScrollList.make>
    | null
} => {
  if (model.viewport === 0) return { model, command: null }
  let to = follow ? -1 : null
  const waiting = Virtualizer.waitingOf(model, props)
  if (waiting !== null) {
    const target = Virtualizer.targetOf(model, props, waiting)
    if (target !== null) {
      to = waiting.target._tag === "End"
        ? -1
        : Math.max(0, Math.round(originOf(model, props) + target))
    }
  }
  if (to === null) return { model, command: null }
  const reached = to === -1
    ? atEndOf(model, props)
    : Virtualizer.same(model.scrollOffset, to)
  if (
    model.aimed !== null && model.aimed.to === to &&
    (reached || Virtualizer.same(model.aimed.content, model.content))
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
  props: VirtualListProps,
  { events, model }: Virtualizer.Updated<Model>,
  follow = false
) => {
  const { command, model: next } = aim(model, props, follow)
  const step = next === $.model ? $ : $.set(next)
  const emitted = events.length === 0 ? step : step.emit(...events)
  return command === null ? emitted : emitted.run(command)
}

const scrolling = (
  model: Model,
  props: VirtualListProps,
  on: boolean
): Virtualizer.Updated<Model> =>
  model.scrolling === on ? { model, events: [] } : Virtualizer.update(
    model,
    props,
    Virtualizer.Message.ScrolledViewport({
      offset: model.offset,
      height: model.height,
      length: model.length,
      scrolling: on
    })
  )

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
    ...Virtualizer.init(withDefaults($.props)),
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
    momentum: false
  }),
  update: ($, message) => {
    const { model } = $
    const props = withDefaults($.props)
    switch (message._tag) {
      case "LaidOutViewport": {
        let sizes = model.sizes
        if (
          model.cross !== 0 && !Virtualizer.same(model.cross, message.cross)
        ) {
          const rendered = new Set(
            Virtualizer.plan(model, props).items.map((i) =>
              Virtualizer.sizeKey(props, i)
            )
          )
          sizes = Object.fromEntries(
            Object.entries(sizes).filter(([key]) => rendered.has(key))
          )
        }
        return finish(
          $,
          props,
          moved(
            { ...model, sizes, viewport: message.size, cross: message.cross },
            props
          )
        )
      }
      case "Scrolled":
        return finish(
          $,
          props,
          moved(
            {
              ...model,
              scrollOffset: message.offset,
              viewport: message.viewport,
              content: message.content
            },
            props
          )
        )
      case "ResizedContent": {
        const next = { ...model, content: message.content }
        // Following the end, the list stays at it until the scroll gets there.
        return following(model, props)
          ? finish($, props, { model: next, events: [] }, true)
          : finish($, props, moved(next, props, true))
      }
      case "PlacedSpacer":
        return finish(
          $,
          props,
          moved({ ...model, spacer: message.at }, props, true)
        )
      case "LaidOutItem": {
        const { at, epoch, first, index, key, size } = message
        return finish(
          $,
          props,
          Virtualizer.update(
            first
              ? { ...model, placed: { index, key: key ?? String(index), at } }
              : model,
            props,
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
          following(model, props)
        )
      }
      case "Requested":
        return finish(
          $,
          props,
          Virtualizer.update(
            model,
            props,
            Virtualizer.Message.RequestedScroll({ scrollTo: message.scrollTo })
          )
        )
      case "Resolved":
        return finish($, props, { model, events: [] })
      case "Fixed":
        return $.set({ ...model, placed: null })
      case "DragBegan": {
        const dropped = Virtualizer.update(
          model,
          props,
          Virtualizer.Message.ScrolledByUser()
        ).model
        return finish(
          $,
          props,
          scrolling({ ...dropped, aimed: null }, props, true)
        ).run(Command.interrupt(Settle))
      }
      case "DragEnded":
        return model.momentum ? $ : $.run(Settle.make())
      case "MomentumBegan":
        return $.set({ ...model, momentum: true })
          .run(Command.interrupt(Settle))
      case "MomentumEnded":
        return finish(
          $,
          props,
          scrolling({ ...model, momentum: false }, props, false)
        )
      case "Settled":
        return model.momentum
          ? $
          : finish($, props, scrolling(model, props, false))
    }
  },
  subscriptions: ({ model, props }) => {
    const fresh = Virtualizer.freshOf(model, props)
    // A held request can resolve on a props change alone, such as the keys
    // bringing its key, which sends no message that would scroll to it.
    const held = fresh !== null || model.viewport === 0
      ? null
      : Virtualizer.waitingOf(model, props)
    const target = held === null
      ? null
      : Virtualizer.targetOf(model, withDefaults(props), held)
    return [
      fresh !== null &&
      Subscription.make(
        "VirtualList.scrollTo",
        JSON.stringify(fresh),
        () => Stream.make(Message.Requested({ scrollTo: fresh }))
      ),
      target !== null &&
      Subscription.make(
        "VirtualList.resolved",
        String(target),
        () => Stream.make(Message.Resolved())
      ),
      // Fixed rows report no placement, and native can move them without a
      // scroll or a new content size, so the last placement is dropped as
      // the props switch to fixed sizes.
      props.measure === false && model.placed !== null &&
      Subscription.make(
        "VirtualList.fixed",
        "",
        () => Stream.make(Message.Fixed())
      )
    ]
  },
  parts: (p, model) => {
    const props = withDefaults(p.props)
    const plan = Virtualizer.plan(model, props)
    const horizontal = props.horizontal === true
    const axis = horizontal ? "width" : "height"
    const anchored = anchoredOf(props)
    const anchor = plan.window[0]
    const main = (rect: Native.Rect) => horizontal ? rect.x : rect.y
    const length = (
      rect: { readonly width: number; readonly height: number }
    ) => horizontal ? rect.width : rect.height

    const onScroll = (event: Native.ScrollPayload): Message | undefined => {
      const offset = horizontal ? event.x : event.y
      const viewport = length(event)
      const content = horizontal ? event.contentWidth : event.contentHeight
      const start = startOf(model, props, offset, plan)
      // Most scroll events leave the same items visible and send nothing.
      // A waiting request's plan is around its target, not the viewport, so
      // the scroll that reaches the target is sent.
      return props.trackScroll !== true && plan.request === null &&
          Virtualizer.same(viewport, model.viewport) &&
          Virtualizer.same(content, model.content) &&
          Virtualizer.within(plan.first, start) &&
          Virtualizer.within(plan.last, start + viewport) &&
          (offset <= Virtualizer.edgeThreshold) === model.atStart &&
          atEndOf({ scrollOffset: offset, viewport, content }, props) ===
            model.atEnd
        ? undefined
        : Message.Scrolled({ offset, viewport, content })
    }

    const spacerPart = p.part(
      "view",
      (b) =>
        b.on(
          "layout",
          ({ layout }) =>
            Virtualizer.same(main(layout), model.spacer)
              ? undefined
              : Message.PlacedSpacer({ at: main(layout) })
        )
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
      const key = Virtualizer.keyOf(props, index)
      const known = model.sizes[Virtualizer.sizeKey(props, index)]
      // The first item around the viewport also reports where it moves to.
      const first = index === anchor
      const { placed } = model
      return b.on("layout", ({ layout }) => {
        const size = length(layout)
        const at = main(layout)
        return known !== undefined && Virtualizer.same(known, size) &&
            (!first || (placed !== null && placed.index === index &&
              Virtualizer.same(placed.at, at)))
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
      const before = spacer("before", plan.before + reserveOf(props), true)
      let k = 0
      for (const child of children) {
        const item = child._tag === "Element" &&
          child.owned?.some((layer) => layer.owner === owner) === true
        if (item) {
          const index = plan.items[k]!
          const gap = plan.gaps.get(index)
          if (k === 0) out.push(before)
          else if (gap !== undefined) out.push(spacer("between:" + index, gap))
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
            Virtualizer.same(length(layout), model.viewport) &&
              Virtualizer.same(
                horizontal ? layout.height : layout.width,
                model.cross
              )
              ? undefined
              : Message.LaidOutViewport({
                size: length(layout),
                cross: horizontal ? layout.height : layout.width
              }))
          .on("scroll", onScroll)
          .on("contentSizeChange", (size) =>
            Virtualizer.same(length(size), model.content)
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
