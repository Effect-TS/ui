/**
 * A todo app in HTML: a controlled new-todo field that rejects titles over 20
 * characters, a keyed list of rows with a controlled checkbox each, and a
 * button that clears the done ones.
 */
import { Schema } from "effect"

import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"

export const maxTitle = 20

export const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
export type Todo = typeof Todo.Type

// ---------------------------------------------------------------------------
// TodoItem
// ---------------------------------------------------------------------------

export const TodoItemMessage = UiSchema.TaggedEnum({ Toggle: { done: Schema.Boolean }, Delete: {} })

export const TodoItemEvents = UiSchema.TaggedEnum({
  Toggled: { id: Schema.String, done: Schema.Boolean },
  Deleted: { id: Schema.String }
})

export const TodoItem = Component.define({
  name: "TodoItem",
  props: Schema.Struct({ todo: Todo }),
  model: Schema.Struct({}),
  message: TodoItemMessage,
  events: TodoItemEvents,
  elements: Html
}).make({
  init: () => ({}),
  update: (_, message, $) =>
    TodoItemMessage.match(message, {
      Toggle: ({ done }) => $.emit(TodoItemEvents.Toggled({ id: $.props.todo.id, done })),
      Delete: () => $.emit(TodoItemEvents.Deleted({ id: $.props.todo.id }))
    }),
  view: (_, h) =>
    h.li.class(h.props.todo.done && "done").children(
      h.label(
        h.input.attr("type", "checkbox").checked(h.props.todo.done)
          .onInput(({ checked }) => TodoItemMessage.Toggle({ done: checked })),
        h.props.todo.title
      ),
      h.button.attr("aria-label", `Delete ${h.props.todo.title}`)
        .onClick(TodoItemMessage.Delete()).children("×")
    )
})

// ---------------------------------------------------------------------------
// TodoApp
// ---------------------------------------------------------------------------

export const TodoAppMessage = UiSchema.TaggedEnum({
  Draft: { value: Schema.String },
  Add: {},
  Toggled: { id: Schema.String, done: Schema.Boolean },
  Deleted: { id: Schema.String },
  ClearDone: {}
})
export type TodoAppMessage = typeof TodoAppMessage.Type

export const TodoAppModel = Schema.Struct({
  draft: Schema.String,
  nextId: Schema.Number,
  todos: Schema.Array(Todo)
})
export type TodoAppModel = typeof TodoAppModel.Type

export const TodoApp = Component.define({
  name: "TodoApp",
  model: TodoAppModel,
  message: TodoAppMessage,
  elements: Html
}).make({
  init: (): TodoAppModel => ({ draft: "", nextId: 1, todos: [] }),
  update: (model, message): TodoAppModel =>
    TodoAppMessage.match(message, {
      // Rejected: the field keeps showing the Model's draft.
      Draft: ({ value }) => value.length > maxTitle ? model : { ...model, draft: value },
      Add: () => {
        const title = model.draft.trim()
        if (title === "") return model
        return {
          draft: "",
          nextId: model.nextId + 1,
          todos: [...model.todos, { id: `t${model.nextId}`, title, done: false }]
        }
      },
      Toggled: ({ done, id }) => ({
        ...model,
        todos: model.todos.map((todo) => todo.id === id ? { ...todo, done } : todo)
      }),
      Deleted: ({ id }) => ({ ...model, todos: model.todos.filter((todo) => todo.id !== id) }),
      ClearDone: () => ({ ...model, todos: model.todos.filter((todo) => !todo.done) })
    }),
  view: (model, h) => {
    const left = model.todos.filter((todo) => !todo.done).length
    return h.main(
      h.h1("Todos"),
      h.form.onSubmit(TodoAppMessage.Add()).children(
        h.input.attr("aria-label", "New todo").attr("placeholder", "What needs doing?").value(model.draft)
          .onInput(({ value }) => TodoAppMessage.Draft({ value })),
        h.button.attr("type", "submit").children("Add")
      ),
      h.ul.attr("aria-label", "Todos").children(
        model.todos.map((todo) =>
          TodoItem(h, {
            key: todo.id,
            props: { todo },
            onEmit: (emitted) =>
              emitted._tag === "Toggled"
                ? TodoAppMessage.Toggled({ id: emitted.id, done: emitted.done })
                : TodoAppMessage.Deleted({ id: emitted.id })
          })
        )
      ),
      h.p(`${left} ${left === 1 ? "item" : "items"} left`),
      h.button.disabled(left === model.todos.length)
        .onClick(TodoAppMessage.ClearDone()).children("Clear done")
    )
  }
})
