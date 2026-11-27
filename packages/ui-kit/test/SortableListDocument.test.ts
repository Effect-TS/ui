// @vitest-environment happy-dom
import { type Component, UiSchema } from "@effect/ui"
import { SortableList } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, container, press, tick } from "./utils/document.ts"

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
type Todo = typeof Todo.Type

const reorder = <A>(
  items: ReadonlyArray<A>,
  from: number,
  to: number
): Array<A> => {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

const announce = (
  announcement: Component.Headless.Parts<typeof SortableList>["announcement"],
  todos: ReadonlyArray<Todo>
): string => {
  if (announcement === undefined) return ""
  const title = todos.find((todo) => todo.id === announcement.id)?.title ??
    announcement.id
  return `${title} ${announcement._tag} ${announcement.position} of ${announcement.count}`
}

const key = (target: Element, key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

const keyboardClick = (target: Element) =>
  target.dispatchEvent(
    new PointerEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 0,
      pointerType: ""
    })
  )

class Transfer {
  dropEffect = "none"
  effectAllowed = "uninitialized"
  readonly strings = new Map<string, string>()
  get types() {
    return [...this.strings.keys()]
  }
  setData(type: string, value: string) {
    this.strings.set(type.toLowerCase(), value)
  }
  getData(type: string) {
    return this.strings.get(type.toLowerCase()) ?? ""
  }
}

const drag = (
  element: Element,
  name: string,
  transfer: Transfer,
  at = { x: 0, y: 0 }
) => {
  const event = new MouseEvent(name, {
    bubbles: true,
    cancelable: true,
    clientX: at.x,
    clientY: at.y
  })
  Object.defineProperty(event, "dataTransfer", { value: transfer })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

const box = (
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number
) => {
  element.getBoundingClientRect = () =>
    ({ left, top, width, height }) as DOMRect
}

describe("SortableList in a document", { concurrent: false }, () => {
  it.effect("keyboard reorder with h.lazy rows emits once, avoids row re-renders during move, and keeps focus on the moved handle", () =>
    Effect.gen(function*() {
      let rowRenders = 0
      const TodoContent = (h: Html.H<any>, todo: Todo) => {
        rowRenders += 1
        return h.span.children(todo.title)
      }

      const Message = UiSchema.TaggedEnum({
        Reordered: { from: Schema.Number, to: Schema.Number },
        PressedEscape: {}
      })

      const App = Html.component({
        name: "SortableTodos",
        model: Schema.Struct({
          todos: Schema.Array(Todo),
          events: Schema.Array(
            Schema.Struct({ from: Schema.Number, to: Schema.Number })
          ),
          escapes: Schema.Number
        }),
        message: Message
      }).make({
        init: () => ({
          todos: [
            { id: "a", title: "Buy milk" },
            { id: "b", title: "Walk dog" },
            { id: "c", title: "Read book" }
          ],
          events: [],
          escapes: 0
        }),
        update: {
          Reordered: ($, { from, to }) =>
            $.evolve({
              todos: reorder($.model.todos, from, to),
              events: [...$.model.events, { from, to }]
            }),
          PressedEscape: ($) => $.evolve({ escapes: $.model.escapes + 1 })
        },
        view: (h, model) =>
          SortableList(h, {
            props: { items: model.todos.map((todo) => todo.id) },
            onEmit: {
              Reordered: ({ from, to }) => Message.Reordered({ from, to })
            },
            view: (sortableList) =>
              h.div.on(
                "keydown",
                ({ key }) =>
                  key === "Escape" ? Message.PressedEscape() : undefined
              ).children(
                sortableList.list(h.ul.attr("id", "list")).children(
                  model.todos.map((todo) =>
                    sortableList.item({
                      element: h.li.attr("data-id", todo.id),
                      id: todo.id
                    }).children(
                      sortableList.handle({
                        element: h.button.attr("id", `handle-${todo.id}`),
                        id: todo.id
                      }).attr("aria-label", `Reorder ${todo.title}`),
                      h.lazy(TodoContent, todo)
                    )
                  )
                ),
                sortableList.status(h.div.attr("id", "status")).children(
                  announce(sortableList.announcement, model.todos)
                )
              )
          })
      })

      const app = yield* container
      const root = yield* BrowserHost.mountEffect(App, {}, app)
      yield* tick
      const rendersAfterMount = rowRenders

      const handleA = byId("handle-a") as HTMLButtonElement
      handleA.focus()
      assert.strictEqual(document.activeElement?.id, "handle-a")

      keyboardClick(handleA)
      yield* tick
      key(handleA, "ArrowDown")
      key(handleA, "ArrowDown")
      yield* tick
      assert.strictEqual(rowRenders, rendersAfterMount)

      keyboardClick(handleA)
      yield* tick

      const order = Array.from(
        app.querySelectorAll("#list > li"),
        (li) => li.getAttribute("data-id")
      )
      assert.deepStrictEqual(order, ["b", "c", "a"])
      assert.deepStrictEqual(root.model()?.events, [{ from: 0, to: 2 }])
      assert.strictEqual(document.activeElement?.id, "handle-a")
      assert.strictEqual(
        byId("status").textContent,
        "Buy milk Dropped 3 of 3"
      )

      // An idle handle leaves Escape to the enclosing element; a move's
      // Escape cancels the move instead.
      key(handleA, "Escape")
      keyboardClick(handleA)
      yield* tick
      key(handleA, "Escape")
      yield* tick
      assert.strictEqual(root.model()?.escapes, 1)
      assert.strictEqual(
        byId("status").textContent,
        "Buy milk Cancelled 3 of 3"
      )
    }).pipe(Effect.scoped))

  it.effect("pick-then-place survives an iOS tap's focusout before click, and pointer drag is scoped per list", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        ReorderedFirst: { from: Schema.Number, to: Schema.Number },
        ReorderedSecond: { from: Schema.Number, to: Schema.Number }
      })

      const DualLists = Html.component({
        name: "DualLists",
        model: Schema.Struct({
          first: Schema.Array(Schema.String),
          second: Schema.Array(Schema.String)
        }),
        message: Message
      }).make({
        init: () => ({
          first: ["a", "b", "c"],
          second: ["x", "y"]
        }),
        update: {
          ReorderedFirst: ($, { from, to }) =>
            $.evolve({ first: reorder($.model.first, from, to) }),
          ReorderedSecond: ($, { from, to }) =>
            $.evolve({ second: reorder($.model.second, from, to) })
        },
        view: (h, model) =>
          h.div(
            SortableList(h, {
              // Keys that differ only by case still get distinct drag types.
              key: "list",
              props: { items: model.first },
              onEmit: {
                Reordered: ({ from, to }) =>
                  Message.ReorderedFirst({ from, to })
              },
              view: (sortableList) =>
                sortableList.list(h.ul.attr("id", "first")).children(
                  model.first.map((id) =>
                    sortableList.item({
                      element: h.li.attr("id", `first-${id}`),
                      id
                    }).children(
                      sortableList.handle({
                        element: h.button.attr("id", `first-handle-${id}`),
                        id
                      }).children(id)
                    )
                  )
                )
            }),
            SortableList(h, {
              key: "List",
              props: { items: model.second },
              onEmit: {
                Reordered: ({ from, to }) =>
                  Message.ReorderedSecond({ from, to })
              },
              view: (sortableList) =>
                sortableList.list(h.ul.attr("id", "second")).children(
                  model.second.map((id) =>
                    sortableList.item({
                      element: h.li.attr("id", `second-${id}`),
                      id
                    }).children(
                      sortableList.handle({
                        element: h.button.attr("id", `second-handle-${id}`),
                        id
                      }).children(id)
                    )
                  )
                )
            })
          )
      })

      const app = yield* container
      const root = yield* BrowserHost.mountEffect(DualLists, {}, app)
      yield* tick

      // iOS: a tap sends pointerdown, then a mousedown that blurs the
      // current handle without focusing the tapped one, then the click.
      const handleA = byId("first-handle-a") as HTMLButtonElement
      const handleC = byId("first-handle-c") as HTMLButtonElement
      handleA.focus()
      keyboardClick(handleA)
      yield* tick

      press(handleC, "touch")
      handleC.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      )
      handleA.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      )
      handleC.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          cancelable: true,
          detail: 1,
          pointerType: "touch"
        })
      )
      yield* tick
      assert.deepStrictEqual(root.model()?.first, ["b", "c", "a"])

      // Real pointer drag: list 2 rejects list 1's row; list 1 accepts and reorders.
      const itemC = byId("first-c")
      const itemB = byId("first-b")
      const otherX = byId("second-x")
      box(itemB, 0, 0, 200, 40)
      box(otherX, 0, 100, 200, 40)

      const transfer = new Transfer()
      drag(itemC, "dragstart", transfer)
      assert.strictEqual(
        drag(otherX, "dragover", transfer, { x: 10, y: 110 }),
        false
      )
      assert.strictEqual(
        drag(itemB, "dragover", transfer, { x: 10, y: 5 }),
        true
      )
      assert.strictEqual(drag(itemB, "drop", transfer, { x: 10, y: 5 }), true)
      drag(itemC, "dragend", transfer)
      yield* tick

      assert.deepStrictEqual(root.model()?.first, ["c", "b", "a"])
      assert.deepStrictEqual(root.model()?.second, ["x", "y"])
    }).pipe(Effect.scoped))
})
