/**
 * A list the user reorders by dragging a row, or without a pointer by
 * activating a row's handle, choosing where it goes, and activating a handle
 * again. The order stays the consumer's: `SortableList` emits
 * `Reordered { from, to }` and draws whatever `items` says.
 *
 * `SortableList` is a headless component. It keeps the row being moved and
 * where it would land, moves focus to the moved row's handle after a drop,
 * and gives the consumer what to announce.
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
 * the `PickedUp` one. `Dropped` reads the row's position from the current
 * `items`, so it stays true when the consumer refuses a `Reordered`, and
 * clears once `items` changes otherwise.
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
 * Props for a `SortableList`.
 *
 * **Details**
 *
 * - `items`: the id of every row, in the order they are drawn. Required.
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
  ChangedItems: {},
  FoundDirection: { rtl: Schema.Boolean }
})

type SortableListMessage = typeof SortableListMessage.Type

// `moving.over`: a drag is over one of the list's drop targets.
// `ended`: the last move's outcome, with the `count` of rows at that time.
// `pressed`: a handle's `mousedown` during a move, until its `mouseup`.
// Safari and iOS blur on that `mousedown` without focusing the button, so
// the `focusout` it causes before the click doesn't cancel.
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

const rtlOf = ($: Directed & { readonly model: SortableListModel }) =>
  rightToLeft($.reads.provider, $.model.rtl)

// The index the row ends at when dropped before or after the row at `over`.
const landing = (from: number, over: number, after: boolean): number => {
  const slot = after ? over + 1 : over
  return slot > from ? slot - 1 : slot
}

const fromOf = ($: SortableListUpdate) =>
  $.model.moving === null ? -1 : $.props.items.indexOf($.model.moving.id)

const commit = ($: SortableListUpdate, target: number, focus: boolean) => {
  const moving = $.model.moving!
  const from = $.props.items.indexOf(moving.id)
  // Rows may have been removed since the landing place was chosen.
  const to = Math.min(target, $.props.items.length - 1)
  const next = $.set({
    ...$.model,
    moving: null,
    pressed: false,
    ended: {
      dropped: true,
      id: moving.id,
      from,
      to,
      count: $.props.items.length
    }
  })
  const emitted = to === from
    ? next
    : next.emit(SortableListEvents.Reordered({ from, to }))
  return focus
    ? emitted.run(
      HtmlCommand.Focus.make({ ref: Handle.at(moving.id) }).pipe(
        Command.asNoop
      )
    )
    : emitted
}

const cancel = ($: SortableListUpdate) => {
  const moving = $.model.moving
  if (moving === null) return $.model
  const from = fromOf($)
  return $.set({
    ...$.model,
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

const dragging = ($: SortableListUpdate): boolean =>
  $.props.disabled !== true && $.model.moving?.dragging === true &&
  fromOf($) >= 0

// `undefined` when the row under the pointer is gone from `items`.
const dragTo = (
  $: SortableListUpdate,
  id: string,
  after: boolean
): number | undefined => {
  const over = $.props.items.indexOf(id)
  return over < 0 ? undefined : landing(fromOf($), over, after)
}

const step = ($: SortableListUpdate, key: string) => {
  const moving = $.model.moving!
  if (key === "Escape") return cancel($)
  const last = $.props.items.length - 1
  const to = ListNavigation.target(key, {
    at: Math.min(moving.to, last),
    last,
    orientation: $.props.orientation ?? "vertical",
    rtl: rtlOf($),
    loop: "none"
  })
  if (to === undefined || to === moving.to) return $.model
  return $.set({ ...$.model, moving: { ...moving, to, stepped: true } }).run(
    HtmlCommand.ScrollIntoView.make({
      ref: Item.at($.props.items[to]!),
      options: { block: "nearest", inline: "nearest" }
    }).pipe(Command.asNoop)
  )
}

// The last outcome still describes `items`: the row is where it landed, or
// where it started when the consumer refused the move.
const current = (
  ended: NonNullable<SortableListModel["ended"]>,
  items: ReadonlyArray<string>
): boolean => {
  const at = items.indexOf(ended.id)
  return at >= 0 && ended.count === items.length &&
    (at === ended.to || at === ended.from)
}

const releasedPointer = HtmlSubscription.onDocument(
  "mouseup",
  SortableListMessage.ReleasedPointer()
)

const changedItems = Subscription.make(
  "changedItems",
  Stream.make(SortableListMessage.ChangedItems())
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
  return ended === null || !current(ended, items) ? undefined : {
    _tag: ended.dropped ? "Dropped" : "Cancelled",
    id: ended.id,
    position: items.indexOf(ended.id) + 1,
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
 * Its own attributes win over the ones the consumer set on the builder
 * before the part, including the ones a state leaves absent:
 *
 * - `list`: `data-orientation`, `data-moving` and `data-disabled`
 * - `item`: `draggable`, `data-moving` and `data-drop-position`
 * - `handle`: `type="button"`, `disabled`, `aria-disabled` (removed),
 *   `aria-pressed` (only for a move by handle, not a drag), `data-moving`
 *   and `data-disabled`
 * - `status`: `role="status"`, `aria-live="polite"` and `aria-atomic="true"`
 *
 * `list` handles `focusout`, `dragenter`, `dragleave` and `drop`; `item`
 * handles `dragstart`, `dragover`, `dragleave`, `drop` and `dragend`;
 * `handle` handles `click`, `mousedown` and `keydown`. Each is on a layer of
 * its own, so the consumer's handlers still run. A row drags only rows of
 * the same list, and a drop in a gap between rows lands where the last row
 * hovered said. The list follows the nearest `DirectionProvider` above it
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
      if (moving === null || moving.dragging || fromOf($) < 0) {
        return $.set({
          ...$.model,
          moving: {
            id,
            to: at,
            stepped: false,
            dragging: false,
            over: true
          },
          ended: null,
          pressed: false
        })
      }
      return commit($, id === moving.id ? moving.to : at, true)
    },
    PressedKey: ($, { key }) =>
      $.model.moving === null || $.model.moving.dragging || fromOf($) < 0
        ? $.model
        : step($, key),
    PressedHandle: ($) => $.evolve({ pressed: true }),
    ReleasedPointer: ($) => $.evolve({ pressed: false }),
    LeftList: ($) => $.model.pressed ? $.model : cancel($),
    StartedDrag: ($, { id }) =>
      $.props.disabled === true || !$.props.items.includes(id)
        ? $.model
        : $.set({
          ...$.model,
          moving: {
            id,
            to: $.props.items.indexOf(id),
            stepped: false,
            dragging: true,
            over: false
          },
          ended: null,
          pressed: false
        }),
    DraggedOver: ($, { after, id }) => {
      const to = dragging($) ? dragTo($, id, after) : undefined
      return to === undefined
        ? $.model
        : $.evolve({ moving: { ...$.model.moving!, to, over: true } })
    },
    LeftDropTarget: ($) =>
      dragging($)
        ? $.evolve({ moving: { ...$.model.moving!, over: false } })
        : $.model,
    EnteredList: ($) =>
      dragging($)
        ? $.evolve({ moving: { ...$.model.moving!, over: true } })
        : $.model,
    DroppedOnItem: ($, { after, id }) => {
      const to = dragging($) ? dragTo($, id, after) : undefined
      return to === undefined ? $.model : commit($, to, false)
    },
    DroppedOnList: ($) =>
      dragging($) ? commit($, $.model.moving!.to, false) : $.model,
    EndedDrag: ($) => $.model.moving?.dragging === true ? cancel($) : $.model,
    ChangedItems: ($) => $.evolve({ ended: null }),
    FoundDirection: ($, { rtl }) => $.evolve({ rtl })
  },
  subscriptions: ({ model, props }) => [
    model.pressed && releasedPointer,
    // Once `items` no longer matches the last outcome, forget it, so a later
    // edit that restores the old count can't bring the announcement back.
    model.ended !== null && !current(model.ended, props.items) && changedItems
  ],
  parts: (p, model) => {
    const { items } = p.props
    const disabled = p.props.disabled === true
    const orientation = p.props.orientation ?? "vertical"
    const horizontal = orientation === "horizontal"
    const rtl = rightToLeft(p.reads.provider, model.rtl)
    const indexes = new Map<string, number>()
    for (const [at, id] of items.entries()) {
      if (indexes.has(id)) {
        throw new Error(
          "SortableList: two items have the id " + JSON.stringify(id)
        )
      }
      indexes.set(id, at)
    }
    const indexOf = (id: string): number => {
      const at = indexes.get(id)
      if (at === undefined) {
        throw new Error(
          "SortableList: no item with id " + JSON.stringify(id) + " in items"
        )
      }
      return at
    }

    const from = model.moving === null
      ? undefined
      : indexes.get(model.moving.id)
    const move: SortableListMove | undefined = disabled || from === undefined ?
      undefined :
      {
        id: model.moving!.id,
        from,
        to: Math.min(model.moving!.to, items.length - 1)
      }
    const indicated = move !== undefined && move.to !== move.from &&
        (!model.moving!.dragging || model.moving!.over)
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
    const after = (
      { height, width, x, y }: Html.DragOverPayload
    ): boolean => horizontal ? x >= width / 2 !== rtl : y >= height / 2

    const itemPart = p.part((b, id: string) => {
      indexOf(id)
      const own = b.attrs({
        draggable: disabled ? undefined : "true",
        "data-moving": flag(move?.id === id),
        "data-drop-position": indicated === id
          ? (move!.to > move!.from ? "after" : "before")
          : undefined
      }).ref(Item.at(id) as never)
      return disabled ? own : own
        .on("dragstart", SortableListMessage.StartedDrag({ id }), {
          data: { [dragType]: id },
          effectAllowed: "move"
        } as Html.DragSourceOptions)
        .on(
          "dragover",
          (payload) =>
            SortableListMessage.DraggedOver({
              id,
              after: after(payload as Html.DragOverPayload)
            })
        )
        .on("dragleave", SortableListMessage.LeftDropTarget())
        .on(
          "drop",
          (payload) =>
            SortableListMessage.DroppedOnItem({
              id,
              after: after(payload as Html.DropPayload)
            }),
          dropTarget
        )
        .on("dragend", SortableListMessage.EndedDrag())
    })

    const handlePart = p.part("button", (b, id: string) => {
      indexOf(id)
      return b
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
        .on(
          "mousedown",
          () => keyboard ? SortableListMessage.PressedHandle() : undefined
        )
        .on(
          "keydown",
          (key) =>
            keyboard && !key.composing &&
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
        const own = b.attrs({
          "data-orientation": orientation,
          "data-moving": flag(move !== undefined),
          "data-disabled": flag(disabled)
        }).on(
          "focusout",
          (payload) =>
            keyboard && !(payload as Html.FocusOutPayload).within
              ? SortableListMessage.LeftList()
              : undefined
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
