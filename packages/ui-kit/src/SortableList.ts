/**
 * A headless list reordered by dragging rows or activating handles.
 * The consumer owns the order: `SortableList` emits `Reordered { from, to }`
 * and renders the order supplied in `items`.
 *
 * The component tracks the move and provides announcement data. A drop by
 * handle focuses the moved row's handle. A pointer drop leaves focus unchanged.
 *
 * **Anatomy**
 *
 * | Part     | Element                                      |
 * | :------- | :------------------------------------------- |
 * | `list`   | any element, usually a `<ul>` or `<ol>`       |
 * | `item`   | any element, one per entry in `items`        |
 * | `handle` | `<button>`, one in each item                 |
 * | `status` | any element, a polite live region            |
 *
 * `list` and `status` take the consumer's builder. `item` and `handle`
 * take `{ element, id }`, with the `id` of one entry in `items`; an `id`
 * that isn't there fails the render. `item` keys its element with `id`, so
 * rows keep their DOM nodes when the order changes. No part adds markup.
 *
 * **Data attributes**
 *
 * Present with an empty value or absent, except `data-orientation` and
 * `data-drop-position`:
 *
 * - `list`: `data-orientation`, `data-moving` and `data-disabled`
 * - `item`: `data-moving` on the row being moved, and `data-drop-position`,
 *   `"before"` or `"after"`, on the row the moved one would land next to
 * - `handle`: `data-moving` and `data-disabled`
 *
 * **Keyboard**
 *
 * The handle is a native `<button type="button">`, so Enter, Space, a tap and
 * a screen reader's activation all arrive as its `click`:
 *
 * | Input                        | Action                                    |
 * | :--------------------------- | :---------------------------------------- |
 * | Activate a handle            | pick its row up                           |
 * | Down, Up (Right, Left)       | move the landing place by one, no wrap    |
 * | Home, End                    | move the landing place to either end      |
 * | Activate the moved handle    | drop at the landing place                 |
 * | Activate another handle      | drop at that row's place                  |
 * | Escape, or focus leaving     | cancel                                    |
 *
 * A horizontal list moves with Right and Left, swapped in a right-to-left
 * layout. The keys are cancelled only during a move, so an enclosing dialog
 * keeps Escape otherwise. A touch screen reader user double-taps one handle,
 * swipes to another row, and double-taps its handle.
 *
 * **Announcements**
 *
 * The parts carry `announcement`: what happened last, the row's `id`, its
 * 1-based `position` and the `count` of rows. Write the sentence in the
 * `status` part, in the user's language, and include how to move the row in
 * the `PickedUp` one. `Dropped` reports the row's current position in `items`,
 * even if the consumer declines the reorder. The announcement clears when
 * the row leaves `items`, the row count changes, or its position matches
 * neither the source nor the destination.
 *
 * **Example** (A reorderable todo list)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { SortableList } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
 * const Message = UiSchema.TaggedEnum({
 *   ReorderedTodos: { from: Schema.Number, to: Schema.Number }
 * })
 *
 * const Todos = Html.component({
 *   name: "Todos",
 *   model: Schema.Struct({ todos: Schema.Array(Todo) }),
 *   message: Message
 * }).make({
 *   init: () => ({ todos: [{ id: "a", title: "Buy milk" }, { id: "b", title: "Walk dog" }] }),
 *   update: {
 *     ReorderedTodos: ($, { from, to }) => {
 *       const todos = [...$.model.todos]
 *       todos.splice(to, 0, ...todos.splice(from, 1))
 *       return { todos }
 *     }
 *   },
 *   view: (h, model) =>
 *     SortableList(h, {
 *       props: { items: model.todos.map((todo) => todo.id) },
 *       onEmit: ({ from, to }) => Message.ReorderedTodos({ from, to }),
 *       view: (sortableList) => {
 *         const { announcement } = sortableList
 *         const title = (id: string) => model.todos.find((todo) => todo.id === id)?.title
 *         return h.div(
 *           sortableList.list(h.ul).children(
 *             model.todos.map((todo) =>
 *               sortableList.item({ element: h.li, id: todo.id }).children(
 *                 sortableList.handle({ element: h.button, id: todo.id })
 *                   .attr("aria-label", `Reorder ${todo.title}`),
 *                 todo.title
 *               )
 *             )
 *           ),
 *           sortableList.status(h.div.class("sr-only")).children(
 *             announcement === undefined
 *               ? ""
 *               : `${title(announcement.id)}, ${announcement._tag}, ${announcement.position} of ${announcement.count}`
 *           )
 *         )
 *       }
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Todos, {}))
 * if (!/<button[^>]* aria-pressed="false"[^>]*aria-label="Reorder Buy milk"/.test(html)) {
 *   throw new Error("the handle isn't a toggle button")
 * }
 * if (!/class="sr-only"[^>]* role="status"/.test(html)) throw new Error("the status isn't a live region")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as HtmlCommand from "@effect/ui/html/HtmlCommand"
import * as HtmlSubscription from "@effect/ui/html/HtmlSubscription"
import * as Mount from "@effect/ui/Mount"
import * as Renderer from "@effect/ui/Renderer"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { DirectionProvider } from "./DirectionProvider.ts"
import { flag, type Keyed } from "./internal/attributes.ts"
import {
  type Directed,
  rightToLeft,
  TrackDirection
} from "./internal/direction.ts"
import * as ListNavigation from "./ListNavigation.ts"

/**
 * Configure row order, disabled state and orientation.
 *
 * - `items`: unique row IDs in render order. Required.
 * - `disabled`: disables every handle and stops drags and drops.
 * - `orientation`: `"vertical"` by default, which moves with Down and Up and
 *   splits rows into top and bottom halves for a drag, or `"horizontal"`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SortableListProps = Schema.Struct({
  items: Schema.Array(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(ListNavigation.Orientation)
})

/**
 * The props of a `SortableList`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SortableListProps = typeof SortableListProps.Type

/**
 * `Reordered` asks to move the row at `from` so that it ends up at `to`:
 * splice it out at `from` and back in at `to`. Nothing is emitted when the
 * row lands where it started.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SortableListEvents = UiSchema.TaggedEnum({
  Reordered: { from: Schema.Number, to: Schema.Number }
})

/**
 * What a `SortableList` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SortableListEvents = typeof SortableListEvents.Type

/**
 * The row being moved: its `id`, its index `from`, and the index `to` it
 * would end up at.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SortableListMove {
  readonly id: string
  readonly from: number
  readonly to: number
}

/**
 * What a `SortableList`'s `status` should say: `PickedUp` when a handle
 * picks a row up, `Moved` as the landing place changes, `Dropped` and
 * `Cancelled` once the move ends. `position` is 1-based: where the row would
 * land while it moves, and where it is after.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SortableListAnnouncement {
  readonly _tag: "PickedUp" | "Moved" | "Dropped" | "Cancelled"
  readonly id: string
  readonly position: number
  readonly count: number
}

const SortableListMessage = UiSchema.TaggedEnum({
  ClickedHandle: { id: Schema.String },
  PressedHandle: {},
  ReleasedPointer: {},
  PressedKey: { key: Schema.String },
  LeftList: {},
  StartedDrag: { id: Schema.String },
  DraggedOver: { id: Schema.String, after: Schema.Boolean },
  LeftDropTarget: {},
  EnteredList: {},
  DroppedOnItem: { id: Schema.String, after: Schema.Boolean },
  DroppedOnList: {},
  EndedDrag: {},
  ChangedProps: {},
  FoundDirection: { rtl: Schema.Boolean }
})

type SortableListMessage = typeof SortableListMessage.Type

// `pressed` prevents Safari/iOS blur on mousedown from cancelling a move
// before the tapped handle receives its click.
const SortableListModel = Schema.Struct({
  moving: Schema.NullOr(Schema.Struct({
    id: Schema.String,
    to: Schema.Number,
    stepped: Schema.Boolean,
    dragging: Schema.Boolean,
    over: Schema.Boolean
  })),
  ended: Schema.NullOr(Schema.Struct({
    dropped: Schema.Boolean,
    id: Schema.String,
    from: Schema.Number,
    to: Schema.Number,
    count: Schema.Number
  })),
  pressed: Schema.Boolean,
  rtl: Schema.Boolean
})

type SortableListModel = typeof SortableListModel.Type

type SortableListUpdate =
  & Component.Update<
    SortableListModel,
    SortableListMessage,
    SortableListEvents,
    SortableListProps
  >
  & Directed

const Handle = Html.ref("SortableListHandle", "button")
const Item = Renderer.ref<globalThis.Element>("SortableListItem")

const fromOf = ($: SortableListUpdate) =>
  $.model.moving === null ? -1 : $.props.items.indexOf($.model.moving.id)

const dragFrom = ($: SortableListUpdate): number =>
  $.props.disabled !== true && $.model.moving?.dragging === true
    ? fromOf($)
    : -1

const pickUp = (
  $: SortableListUpdate,
  id: string,
  at: number,
  dragging: boolean
) =>
  $.evolve({
    moving: { id, to: at, stepped: false, dragging, over: !dragging },
    ended: null,
    pressed: false
  })

const commit = ($: SortableListUpdate, target: number, focus: boolean) => {
  const { id } = $.model.moving!
  const from = fromOf($)
  const count = $.props.items.length
  // Rows may have been removed since the landing place was chosen.
  const to = Math.min(target, count - 1)
  const next = $.evolve({
    moving: null,
    pressed: false,
    ended: { dropped: true, id, from, to, count }
  })
  const emitted = to === from
    ? next
    : next.emit(SortableListEvents.Reordered({ from, to }))
  return focus
    ? emitted.run(
      HtmlCommand.Focus.make({ ref: Handle.at(id) }).pipe(Command.asNoop)
    )
    : emitted
}

const cancel = ($: SortableListUpdate) => {
  const moving = $.model.moving
  if (moving === null) return $.model
  const from = fromOf($)
  return $.evolve({
    moving: null,
    pressed: false,
    ended: moving.dragging || from < 0 ? null : {
      dropped: false,
      id: moving.id,
      from,
      to: from,
      count: $.props.items.length
    }
  })
}

const dragTo = (
  $: SortableListUpdate,
  id: string,
  after: boolean
): number | undefined => {
  const from = dragFrom($)
  const over = $.props.items.indexOf(id)
  if (from < 0 || over < 0) return undefined
  // Removing the source shifts every later insertion slot back by one.
  const slot = after ? over + 1 : over
  return slot > from ? slot - 1 : slot
}

const hover = ($: SortableListUpdate, over: boolean, to?: number) => {
  if (dragFrom($) < 0) return $.model
  const moving = $.model.moving!
  const next = to ?? moving.to
  return moving.over === over && next === moving.to
    ? $.model
    : $.evolve({ moving: { ...moving, to: next, over } })
}

const step = ($: SortableListUpdate, key: string) => {
  const moving = $.model.moving!
  if (key === "Escape") return cancel($)
  const last = $.props.items.length - 1
  const to = ListNavigation.target(key, {
    at: Math.min(moving.to, last),
    last,
    orientation: $.props.orientation ?? "vertical",
    rtl: rightToLeft($.reads.provider, $.model.rtl),
    loop: "none"
  })
  if (to === undefined || to === moving.to) return $.model
  return $.evolve({ moving: { ...moving, to, stepped: true } }).run(
    HtmlCommand.ScrollIntoView.make({
      ref: Item.at($.props.items[to]!),
      options: { block: "nearest", inline: "nearest" }
    }).pipe(Command.asNoop)
  )
}

// Accept either position: the consumer may decline the reorder.
const endedAt = (
  ended: NonNullable<SortableListModel["ended"]>,
  items: ReadonlyArray<string>
): number => {
  const at = items.indexOf(ended.id)
  return ended.count === items.length &&
      (at === ended.to || at === ended.from)
    ? at
    : -1
}

const releasedPointer = [
  HtmlSubscription.onDocument("mouseup", SortableListMessage.ReleasedPointer()),
  HtmlSubscription.onDocument(
    "pointercancel",
    SortableListMessage.ReleasedPointer()
  ),
  HtmlSubscription.onWindow("blur", SortableListMessage.ReleasedPointer())
]

const outdated = (
  { ended, moving }: SortableListModel,
  { disabled, items }: SortableListProps
): boolean =>
  moving !== null
    ? disabled === true || !items.includes(moving.id)
    : ended !== null && endedAt(ended, items) < 0

const changedProps = Subscription.make(
  "changedProps",
  Stream.make(SortableListMessage.ChangedProps())
)

const announcementOf = (
  model: SortableListModel,
  items: ReadonlyArray<string>,
  move: SortableListMove | undefined
): SortableListAnnouncement | undefined => {
  const count = items.length
  if (move !== undefined) {
    return model.moving!.dragging ? undefined : {
      _tag: model.moving!.stepped ? "Moved" : "PickedUp",
      id: move.id,
      position: move.to + 1,
      count
    }
  }
  const ended = model.ended
  if (ended === null) return undefined
  const at = endedAt(ended, items)
  return at < 0 ? undefined : {
    _tag: ended.dropped ? "Dropped" : "Cancelled",
    id: ended.id,
    position: at + 1,
    count
  }
}

/**
 * A headless sortable list. Call it with the consumer's `h`, the `props`,
 * `onEmit` for `Reordered`, and a `view` closure that draws
 * `sortableList.list` around one `sortableList.item` per id, each with a
 * `sortableList.handle` inside, and `sortableList.status` anywhere.
 *
 * **Details**
 *
 * The parts also return `moving`, the `SortableListMove` in progress or
 * `undefined`, `announcement`, a `SortableListAnnouncement` or `undefined`,
 * `disabled` and `orientation`.
 *
 * Part attributes override those already set on the builder, including
 * attributes the part removes:
 *
 * - `list`: `data-orientation`, `data-moving` and `data-disabled`
 * - `item`: `draggable`, `data-moving` and `data-drop-position`
 * - `handle`: `type="button"`, `disabled`, `aria-disabled` (removed),
 *   `aria-pressed` (`"true"` only on the row being moved by handle), `data-moving`
 *   and `data-disabled`
 * - `status`: `role="status"`, `aria-live="polite"` and `aria-atomic="true"`
 *
 * `list` handles `focusout`, `dragenter`, `dragleave` and `drop`; `item`
 * handles `dragstart`, `dragover`, `dragleave`, `drop` and `dragend`;
 * `handle` handles `click`, `mousedown` and `keydown`. Each is on a layer of
 * its own, so the consumer's handlers still run. `focusout`, `mousedown`
 * and `keydown` are handled only during a move by handle, so otherwise
 * they reach the consumer's handlers on enclosing elements. Drops accept only
 * rows from the same list. A drop between rows uses the last hovered position.
 * The list follows the nearest `DirectionProvider`
 * or, without one, the list's CSS `direction`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const SortableList = Html.component({
  name: "SortableList",
  props: SortableListProps,
  model: SortableListModel,
  message: SortableListMessage,
  events: SortableListEvents,
  restore: false,
  reads: {
    provider: { owner: DirectionProvider, optional: true }
  }
}).make({
  init: () => ({ moving: null, ended: null, pressed: false, rtl: false }),
  update: {
    ClickedHandle: ($, { id }) => {
      const at = $.props.items.indexOf(id)
      if ($.props.disabled === true || at < 0) return $.model
      const moving = $.model.moving
      return moving === null || moving.dragging || fromOf($) < 0
        ? pickUp($, id, at, false)
        : commit($, id === moving.id ? moving.to : at, true)
    },
    PressedKey: ($, { key }) =>
      $.model.moving === null || $.model.moving.dragging || fromOf($) < 0
        ? $.model
        : step($, key),
    PressedHandle: ($) => $.evolve({ pressed: true }),
    ReleasedPointer: ($) => $.evolve({ pressed: false }),
    LeftList: ($) => $.model.pressed ? $.model : cancel($),
    StartedDrag: ($, { id }) => {
      const at = $.props.items.indexOf(id)
      return $.props.disabled === true || at < 0
        ? $.model
        : pickUp($, id, at, true)
    },
    DraggedOver: ($, { after, id }) => {
      const to = dragTo($, id, after)
      return to === undefined ? $.model : hover($, true, to)
    },
    LeftDropTarget: ($) => hover($, false),
    EnteredList: ($) => hover($, true),
    DroppedOnItem: ($, { after, id }) => {
      const to = dragTo($, id, after)
      return to === undefined ? $.model : commit($, to, false)
    },
    DroppedOnList: ($) =>
      dragFrom($) < 0 ? $.model : commit($, $.model.moving!.to, false),
    EndedDrag: ($) => $.model.moving?.dragging === true ? cancel($) : $.model,
    // Clear stale state so later props cannot revive a move or announcement.
    ChangedProps: ($) =>
      !outdated($.model, $.props)
        ? $.model
        : $.model.moving === null
        ? $.evolve({ ended: null })
        : cancel($),
    FoundDirection: ($, { rtl }) => $.evolve({ rtl })
  },
  subscriptions: ({ model, props }) => [
    ...(model.pressed ? releasedPointer : []),
    outdated(model, props) && changedProps
  ],
  parts: (p, model) => {
    const { items } = p.props
    const disabled = p.props.disabled === true
    const orientation = p.props.orientation ?? "vertical"
    const horizontal = orientation === "horizontal"
    const rtl = rightToLeft(p.reads.provider, model.rtl)
    const ids = new Set(items)
    if (ids.size !== items.length) {
      throw new Error(
        "SortableList: two items have the id " +
          JSON.stringify(items.find((id, at) => items.indexOf(id) !== at))
      )
    }
    const known = (id: string): void => {
      if (!ids.has(id)) {
        throw new Error(
          "SortableList: no item with id " + JSON.stringify(id) + " in items"
        )
      }
    }

    const from = model.moving === null ? -1 : items.indexOf(model.moving.id)
    const move: SortableListMove | undefined = disabled || from < 0 ?
      undefined :
      {
        id: model.moving!.id,
        from,
        to: Math.min(model.moving!.to, items.length - 1)
      }
    const indicated =
      move !== undefined && move.to !== move.from && model.moving!.over
        ? items[move.to]
        : undefined
    const keyboard = move !== undefined && !model.moving!.dragging

    // Browsers lowercase drag types, so escape capitals to keep ids apart.
    const dragType = "application/x-sortable-list-" +
      p.id("drag").replace(/[A-Z_]/g, (c) => "_" + c.toLowerCase())
    const dropTarget: Html.DropTargetOptions = {
      accepts: [dragType],
      dropEffect: "move",
      preventDefault: "always"
    }
    const after = (payload: unknown): boolean => {
      const { height, width, x, y } = payload as Html.DragOverPayload
      return horizontal ? x >= width / 2 !== rtl : y >= height / 2
    }

    const itemPart = p.part((b, id: string) => {
      known(id)
      const own = b.attrs({
        draggable: disabled ? undefined : "true",
        "data-moving": flag(move?.id === id),
        "data-drop-position": indicated === id
          ? (move!.to > move!.from ? "after" : "before")
          : undefined
      }).ref(Item.at(id) as never)
      if (disabled) return own
      const source: Html.DragSourceOptions = {
        data: { [dragType]: id },
        effectAllowed: "move"
      }
      return own
        .on("dragstart", SortableListMessage.StartedDrag({ id }), source)
        .on(
          "dragover",
          (payload) =>
            SortableListMessage.DraggedOver({ id, after: after(payload) })
        )
        .on("dragleave", SortableListMessage.LeftDropTarget())
        .on(
          "drop",
          (payload) =>
            SortableListMessage.DroppedOnItem({ id, after: after(payload) }),
          dropTarget
        )
        .on("dragend", SortableListMessage.EndedDrag())
    })

    const handlePart = p.part("button", (b, id: string) => {
      known(id)
      const own = b
        .attrs({
          type: "button",
          "aria-disabled": undefined,
          "aria-pressed": String(keyboard && move.id === id),
          "data-moving": flag(move?.id === id),
          "data-disabled": flag(disabled)
        })
        .disabled(disabled)
        .ref(Handle.at(id))
        .on("click", SortableListMessage.ClickedHandle({ id }))
      return !keyboard ? own : own
        .on("mousedown", SortableListMessage.PressedHandle())
        .on(
          "keydown",
          (key) =>
            !key.composing &&
              (key.key === "Escape" || ListNavigation.isKey(key, orientation))
              ? SortableListMessage.PressedKey({ key: key.key })
              : undefined,
          { preventDefault: true }
        )
    })

    return {
      moving: move,
      announcement: announcementOf(model, items, move),
      disabled,
      orientation,
      list: p.part((b) => {
        const attrs = b.attrs({
          "data-orientation": orientation,
          "data-moving": flag(move !== undefined),
          "data-disabled": flag(disabled)
        })
        const own = !keyboard ? attrs : attrs.on(
          "focusout",
          (payload) =>
            (payload as Html.FocusOutPayload).within
              ? undefined
              : SortableListMessage.LeftList()
        )
        const dropping = disabled ? own : own
          .on("dragenter", SortableListMessage.EnteredList())
          .on("dragleave", SortableListMessage.LeftDropTarget())
          .on("drop", SortableListMessage.DroppedOnList(), dropTarget)
        return !horizontal || p.reads.provider !== undefined
          ? dropping
          : dropping.onMount(
            TrackDirection().pipe(
              Mount.map((rtl) => SortableListMessage.FoundDirection({ rtl }))
            )
          )
      }),
      item: View.wrapPart(
        itemPart,
        <B extends Keyed<string>>(
          { element, id }: { readonly element: B; readonly id: string }
        ): ReturnType<B["attr"]> => itemPart(element.key(id), id)
      ),
      handle: View.wrapPart(
        handlePart,
        <B extends View.PartTarget<"button">>(
          { element, id }: { readonly element: B; readonly id: string }
        ): ReturnType<B["attr"]> => handlePart(element, id)
      ),
      status: p.part((b) =>
        b.attrs({
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true"
        })
      )
    }
  }
})
