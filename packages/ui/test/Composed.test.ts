// @vitest-environment happy-dom
import { Command, Component, Composed, Query, Route, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const Note = Schema.Struct({ id: Schema.String, title: Schema.String })
const note = (id: string) => ({ id, title: "Note " + id })

class SaveNote extends Command.Service<SaveNote>()(
  "notes/SaveNote",
  { args: { id: Schema.String } },
  Effect.succeed(() => Effect.void)
) {}

const RowMessage = UiSchema.TaggedEnum({ Typed: { value: Schema.String }, Save: {}, Saved: {} })
const RowEvents = UiSchema.TaggedEnum({ Saved: { title: Schema.String } })
// A row with a draft: state that is lost today when its placement changes.
const Row = Component.define({
  name: "Row",
  props: Schema.Struct({ note: Note }),
  model: Schema.Struct({ draft: Schema.String }),
  message: RowMessage,
  events: RowEvents,
  elements: Html
}).make({
  init: ($) => ({ draft: $.props.note.title }),
  update: (model, message, $) =>
    RowMessage.match(message, {
      Typed: ({ value }) => ({ draft: value }),
      Save: () => $.run(SaveNote.make({ id: $.props.note.id }).pipe(Command.as(RowMessage.Saved()))),
      Saved: () => $.emit(RowEvents.Saved({ title: model.draft }))
    }),
  view: (model, h) =>
    h.p(
      h.button.onClick(RowMessage.Typed({ value: model.draft + "!" })).children("edit " + h.props.note.id),
      model.draft
    )
})

const Card = Component.define({
  name: "Card",
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({ init: () => ({}), update: (model) => model, view: (_, h) => h.section(h.slots.body) })

const NotesMessage = UiSchema.TaggedEnum({
  Archived: { id: Schema.String },
  Retitled: { id: Schema.String, title: Schema.String },
  RowSaved: { id: Schema.String, title: Schema.String },
  Reload: {},
  Reloaded: {}
})

/**
 * A list of rows that follows a query. `list` places every row in order.
 * `moved` places them reversed, inside a slot of another component, and
 * leaves the row `n2` out. Fresh per call: the server is closed over.
 */
const makeApp = (layout: "list" | "moved") => {
  const server = { notes: [note("n1"), note("n2"), note("n3")] }

  class ListNotes extends Query.Service<ListNotes>()(
    "notes/ListNotes",
    { args: { folder: Schema.String }, success: Schema.Array(Note), error: Schema.Never, staleTime: "30 seconds" },
    Effect.succeed(() => Effect.sync(() => server.notes))
  ) {}

  class Reload extends Command.Service<Reload>()(
    "notes/Reload",
    { args: { folder: Schema.String }, invalidates: ({ folder }) => [ListNotes.entry({ folder })] },
    Effect.succeed(() => Effect.void)
  ) {}

  const NotesDef = Component.define({
    name: "Notes",
    model: Schema.Struct({
      archived: Schema.Array(Schema.String),
      saved: Schema.Array(Schema.String),
      missed: Schema.Number
    }),
    message: NotesMessage,
    elements: Html,
    queries: { notes: { query: ListNotes, args: () => ({ folder: "inbox" }) } }
  })

  const Notes = Composed.make(NotesDef, {
    children: {
      rows: {
        component: Row,
        // The one place that says which rows exist: the view doesn't open the query again.
        each: (model, _props, queries) =>
          AsyncResult.isSuccess(queries.notes)
            ? queries.notes.value.filter((note) => !model.archived.includes(note.id)).map((note) => ({
              key: note.id,
              props: { note }
            }))
            : [],
        onEmit: (key, event) => NotesMessage.RowSaved({ id: key, title: event.title })
      }
    },
    init: () => ({ archived: [], saved: [], missed: 0 }),
    update: (model, message, $) =>
      NotesMessage.match(message, {
        Archived: ({ id }) => ({ ...model, archived: [...model.archived, id] }),
        Retitled: ({ id, title }) =>
          Option.match($.children.rows.at(id), {
            onNone: () => ({ ...model, missed: model.missed + 1 }),
            onSome: (row) => {
              row.send(RowMessage.Typed({ value: title }))
              return model
            }
          }),
        RowSaved: ({ id, title }) => ({ ...model, saved: [...model.saved, id + "=" + title] }),
        Reload: () => $.run(Reload.make({ folder: "inbox" }).pipe(Command.as(NotesMessage.Reloaded()))),
        Reloaded: () => model
      }),
    view: (_model, h) =>
      layout === "list"
        ? h.div(...h.children.rows.all().map(([, row]) => row))
        : h.main(h.place(Card, {
          key: "card",
          slots: {
            body: h.div(...[...h.children.rows.all()].reverse().filter(([key]) => key !== "n2").map(([, row]) => row))
          }
        }))
  })

  return { server, Notes, layer: Layer.mergeAll(ListNotes.layer, Reload.layer, SaveNote.layer) }
}

// The inputs of one session: messages for the owner and for its rows, and one refetch that brings a new note.
const session = (app: ReturnType<typeof makeApp>) =>
  Effect.gen(function*() {
    const root = yield* TestHost.mount(app.Notes, {})
    yield* TestHost.settle
    const messages = [
      Composed.childMessage("rows", "n2", RowMessage.Typed({ value: "draft 2" })),
      NotesMessage.Retitled({ id: "n3", title: "three" }),
      NotesMessage.Retitled({ id: "gone", title: "none" }),
      // In the second layout this row isn't placed: its Command runs and reports all the same.
      Composed.childMessage("rows", "n2", RowMessage.Save()),
      NotesMessage.Archived({ id: "n1" })
    ]
    for (const message of messages) {
      root.send(message)
      yield* TestHost.settle
    }
    app.server.notes = [...app.server.notes, note("n4")]
    root.send(NotesMessage.Reload())
    yield* TestHost.settle
    return { path: root.path, model: root.model()!, log: root.log(), text: root.text() }
  }).pipe(Effect.provide(app.layer), Effect.scoped, Effect.provide(TestHost.layer()))

const AppRoute = Route.union({ Home: Route.make("/"), Notes: Route.make("/notes") })
const AppMessage = UiSchema.TaggedEnum({ RouteChanged: { route: AppRoute }, Left: {} })

// Visits the notes page, edits a row, and leaves: what the Router wrote into the entry it left.
const visit = (app: ReturnType<typeof makeApp>) => {
  const App = Component.define({
    name: "App",
    props: Schema.Struct({ route: AppRoute }),
    model: AppRoute,
    message: AppMessage,
    elements: Html
  }).make({
    init: ($) => $.props.route,
    update: (route, message, $) =>
      AppMessage.match(message, {
        RouteChanged: ({ route }) => $.set(route),
        Left: () => $.set(route).run(Router.push(AppRoute, AppRoute.make({ _tag: "Home" })).pipe(Command.asNoop))
      }),
    subscriptions: (route) => [
      Router.subscription(AppRoute, route, (next) => AppMessage.RouteChanged({ route: next }))
    ],
    view: (route, h) =>
      h.main(AppRoute.match(route, { Home: () => h.h1("Home"), Notes: () => app.Notes(h, { key: "notes" }) }))
  })
  const inner = Router.memoryHistory("/notes")
  const written: Array<{ readonly "@effect/ui": { readonly snapshot: Record<string, unknown> } }> = []
  const history: Router.History = {
    ...inner,
    replace: (url, state) => {
      if (JSON.stringify(state).includes("snapshot")) written.push(state as any)
      inner.replace(url, state)
    }
  }
  return Effect.gen(function*() {
    const root = yield* TestHost.mount(App, Router.props(AppRoute))
    yield* TestHost.settle
    Locator.fire(root.get(Locator.text("edit n1", { exact: true })), "click")
    yield* TestHost.settle
    root.send(AppMessage.Left())
    yield* TestHost.settle
    inner.go(-1)
    yield* TestHost.settle
    return { saved: written[written.length - 1]["@effect/ui"].snapshot, restored: root.text() }
  }).pipe(
    Effect.provide(Layer.mergeAll(app.layer, Router.make({ routes: AppRoute, history }))),
    Effect.scoped,
    Effect.provide(TestHost.layer())
  )
}

describe("Composed", () => {
  it.effect("saves the same state under two layouts", () =>
    Effect.gen(function*() {
      const placed = yield* visit(makeApp("list"))
      const moved = yield* visit(makeApp("moved"))
      // What differs is the shells the view placed, and a shell holds nothing.
      const stateful = (saved: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(saved).filter(([, state]) => JSON.stringify(state) !== "{}"))
      assert.notDeepEqual(moved.saved, placed.saved)
      assert.deepStrictEqual(stateful(moved.saved), stateful(placed.saved))
      assert.deepStrictEqual(Object.keys(stateful(placed.saved)), ["/App", "/App/Notes[notes]"])
      // Back restores the draft, in the row the second layout shows.
      assert.isTrue(placed.restored.includes("Note n1!"))
      assert.isTrue(moved.restored.includes("Note n1!"))
    }))

  it.effect("gives the same children and Models for the same inputs under two layouts and with no renderer", () =>
    Effect.gen(function*() {
      const list = makeApp("list")
      const encode = Schema.encodeSync(list.Notes.model)
      const placed = yield* session(list)
      const moved = yield* session(makeApp("moved"))

      assert.deepStrictEqual(encode(placed.model), {
        own: { archived: ["n1"], saved: ["n2=draft 2"], missed: 1 },
        children: {
          rows: [
            { key: "n2", generation: 1, model: { draft: "draft 2" } },
            { key: "n3", generation: 2, model: { draft: "three" } },
            { key: "n4", generation: 3, model: { draft: "Note n4" } }
          ]
        },
        generations: 4
      })
      // The second layout shows other things, and holds the same.
      assert.isTrue(placed.text.includes("edit n2"))
      assert.isFalse(moved.text.includes("edit n2"))
      assert.isTrue(moved.text.indexOf("edit n4") < moved.text.indexOf("edit n3"))
      assert.deepStrictEqual(encode(moved.model as any), encode(placed.model))

      // No renderer: the owner's own entries of the log, with every child's and every lifecycle entry left out.
      const kinds = ["Mounted", "Update", "QueryChanged"]
      const inputs = placed.log.filter((entry) =>
        "path" in entry && entry.path === placed.path && kinds.includes(entry._tag)
      )
      const replay = Story.fromLog(list.Notes, inputs)
      assert.isUndefined(replay.divergence)
      // The six inputs, the messages of the two Commands, and three changes of the query.
      assert.strictEqual(replay.replayed, 11)
      assert.deepStrictEqual(encode(replay.model), encode(placed.model))
    }))

  it("crosses the boundary both ways in a Story: the owner's message to a row, and the row's event back", () => {
    const { Notes } = makeApp("list")
    const s = Story.start(Notes, {}).loaded("notes", [note("n1")])
    s.send(NotesMessage.Retitled({ id: "n1", title: "one" }))
    s.send(Composed.childMessage("rows", "n1", RowMessage.Save()))
    // The row's Command is the owner's to run: its result comes back as the row's message.
    s.resolve(SaveNote, undefined)
    assert.deepStrictEqual(s.model.children.rows, [{ key: "n1", generation: 0, model: { draft: "one" } }])
    assert.deepStrictEqual(s.model.own.saved, ["n1=one"])
  })

  it("drops the result of a Command whose row left, when another row has its key", () => {
    const { Notes } = makeApp("list")
    const s = Story.start(Notes, {}).loaded("notes", [note("n1")])
    s.send(Composed.childMessage("rows", "n1", RowMessage.Typed({ value: "old" })))
    s.send(Composed.childMessage("rows", "n1", RowMessage.Save())).keepPending(SaveNote)
    // The row leaves with its save in flight, and a refetch brings its key back.
    s.loaded("notes", [])
    s.loaded("notes", [note("n1")])
    s.resolve(SaveNote, undefined)
    assert.deepStrictEqual(s.model.children.rows.map((row) => row.model), [{ draft: "Note n1" }])
    assert.deepStrictEqual(s.model.own.saved, [])
  })

  it.effect("follows a change of props that changes which rows exist", () => {
    const Picked = Composed.make(
      Component.define({
        name: "Picked",
        props: Schema.Struct({ id: Schema.String }),
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }),
      {
        children: {
          rows: { component: Row, each: (_model, props) => [{ key: props.id, props: { note: note(props.id) } }] }
        },
        init: () => ({}),
        update: (model) => model,
        view: (_model, h) => h.div(...h.children.rows.all().map(([, row]) => row))
      }
    )
    const Pick = Schema.TaggedStruct("Pick", { id: Schema.String })
    const Picker = Component.define({ name: "Picker", model: Schema.String, message: Pick, elements: Html }).make({
      init: () => "a",
      update: (_id, message) => message.id,
      view: (id, h) => h.main(Picked(h, { key: "picked", props: { id } }))
    })
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Picker, {})
      yield* TestHost.settle
      root.send({ _tag: "Pick", id: "b" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "edit bNote b")
      // The props change and the message that follows it are in the log, so a replay ends with the same row.
      const replay = Story.fromLog(Picked, root.log(), { path: "/Picker/Picked[picked]" })
      assert.isUndefined(replay.divergence)
      assert.deepStrictEqual(replay.model.children.rows.map((row) => row.key), ["b"])
    }).pipe(Effect.provide(SaveNote.layer), Effect.scoped, Effect.provide(TestHost.layer()))
  })

  it("fails the transition that gives one key to two members", () => {
    const { Notes } = makeApp("list")
    const s = Story.start(Notes, {})
    assert.throws(
      () => s.loaded("notes", [note("n1"), note("n1")]),
      "Composed: \"Notes\" children.rows has two members with the key \"n1\""
    )
  })

  it("refuses a child with queries, which would be saved where it is placed", () => {
    const { Notes } = makeApp("list")
    const Def = Component.define({ name: "Outer", model: Schema.Struct({}), message: Schema.Never, elements: Html })
    assert.throws(
      () =>
        Composed.make(Def, {
          children: { inner: { component: Notes, each: () => [] } },
          init: () => ({}),
          update: (model) => model,
          view: (_, h) => h.div()
        }),
      "Composed: \"Outer\" children.inner declares queries"
    )
  })
})
