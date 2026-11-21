## Building user interfaces with `@effect/ui`

`@effect/ui` is a frontend framework whose apps are composed with Layers. You
describe a component with Schemas for its props, Model, messages and events,
and with pure `init`, `update` and `view` functions. Side effects are Commands
and Subscriptions that the runtime runs for you, and data comes from queries,
built with `Query`, also in `@effect/ui`. `@effect/ui/html` adds the HTML elements, the
browser host and router, and server rendering.

A `Command.Service` may omit `invalidates` when it invalidates no queries.
Provide a feature implementation with `NoteActivity.toLayer(ActivityLog)`.
Declare a child component by calling it with the parent's `h`:
`NoteEditor(h, { key, props, onEmit })`. Render a feature service with its
`render`, `NoteActivity.render(h, { key, fallback })`, and include a
`fallback` for loading or failure; a component child may omit it.

A child's key names it among its parent's children of one component, and
its path is `Name[key]`. Leave the key out when the parent renders one
child of that component: `Listbox(h, { props, onEmit, view })` mounts at
`Listbox[]`. Two children of one component, and every row in a list, each
need their own key. A second unkeyed child fails the parent with an error
that asks for a `key`, so a list of one unkeyed row works until a second
row arrives. Two children at one path are one instance: in
`cond ? Listbox(h, { props: a }) : Listbox(h, { props: b })` the Listbox
keeps its Model when `cond` changes, so key each branch when that state
shouldn't carry over. A `Scene` names a child by its component, then by its
key or ref when it has one: `s.childEmit(Listbox, event)`,
`s.childFailure(NoteEditor, Editor.at(id), cause)`.

A parent passes a child state through props, and a child answers through
`events`. A one-shot instruction, such as "save now" or "clear your draft",
is a send: the child lists the tags it accepts in `receives`, the parent
renders the child with a ref from `Child.ref("Name")`, and its `update` calls
`$.send(ref, message)`. Don't send what the child shows: that belongs in its
props.

A child the view stops declaring unmounts and loses its Model. To hide a tab
or a wizard step the user will come back to, keep declaring it with
`detached: tab !== "profile"`: its nodes leave the document, and its Model,
Commands in flight and typed input stay. It still gets props, sends and query
results, and emits through the latest `onEmit`. Its element mounts stop
until it's attached again, and its Subscriptions keep running, so gate those
on the Model. Declare a wizard step once it has been visited, not every step
up front.

### Naming

Name messages, events, Commands and mounts as Foldkit does
(https://foldkit.dev/best-practices/messages). A message is a fact about what
happened, never an instruction, and `update` decides what the fact means for
the current Model. `Set*`, `Update*` and bare imperatives such as `Save` or
`GoHome` are out.

| Thing                                         | Name                                                      | Example                                                         |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Message from a view handler                   | Verb first, past tense: the cause, then the control       | `ClickedDiscard`, `UpdatedBody`, `PressedKey`, `ToggledActions` |
| Message from a Command or mount result        | `Succeeded`, `Failed` or `Completed`, then the definition | `SucceededSaveNote`, `FailedSaveNote`, `CompletedMeasure`       |
| Message from a Subscription or a stream mount | The fact the source reported                              | `Ticked`, `ChangedRoute`, `MovedPointer`                        |
| Message from a child's event                  | The event's verb, then the parent's name for the child    | `ToggledNotify`, `SavedNote`, `PickedLink`                      |
| Message from a child's failure                | `Failed`, then the parent's name for the child            | `FailedEditor`                                                  |
| Message with more than one cause              | The fact the causes share                                 | `RequestedSave`                                                 |
| Event                                         | What the user did, past tense, with no cause              | `Toggled`, `Picked`, `Saved`                                    |
| Command                                       | Imperative, for what its body does                        | `SaveNote`, `WaitBeforeDismissal`                               |
| Mount                                         | Imperative, for what it does to the element               | `DrawChart`, `Measure`, `TrackPointer`                          |
| Parts argument of a headless component        | The component's name in camel case, in full               | `listbox`, `tooltipProvider`                                    |

A Command result takes `Succeeded` and `Failed` when the Command can fail,
and `Completed` otherwise. Name a Command for what its body does, not for
what `update` does with its result: a timer that waits before a toast is
dismissed is `WaitBeforeDismissal`, not `DismissAfter`. `RequestedSave` in
`NoteEditor` comes from the form, Ctrl+S, the autosave Subscription and a
parent's send, so it names what all four report.

A definition's binding and its name string match:
`const DrawChart = Mount.make("DrawChart", ...)`. A `Command.Service` keeps
its feature prefix, as in `"notes/SaveNote"`, and the rule applies to the
last segment.

A component with `shares` takes the `Provider` suffix, as in
`TooltipProvider`. A reader names it `provider` in `shared`, so it reads
`h.shared.provider`. A reader of several owners names each one after its
owner instead, such as `tooltip` and `theme`.

Never write a no-op message, such as `Noop` or a tag added only so a result
has something to send. A Command with nothing to report ends in `Component.noop`,
usually through `Command.asNoop`. It sends nothing, and the log still records
its `CommandEnded` with `silent: true`. A mount that returns `Component.noop`
likewise sends no message and logs `MountEnded` with `silent: true`. A
component with no messages takes `message: Schema.Never`.

Effect UI differs from Foldkit in three places:

- There is no `Got*`. A parent never wraps a child's messages: it maps the
  child's events in `onEmit`, so its message is the event's verb and its
  name for the child.
- A message listed in `receives` has no prefix of its own. It is named like
  any other message, for the fact it reports.
- A Command or mount with nothing to report needs no `Completed*` message. `Component.noop` is enough.

### Command results

A Command whose result one component consumes returns that component's
message from its body. This is the usual form for an app's own Commands,
which live in the file of the component that runs them. `Effect.match` turns
a typed failure into a message as well:

```ts
export class SaveNote extends Command.Service<SaveNote>()(
  "notes/SaveNote",
  { args: { note: Note }, mode: "queue", invalidates: () => [NotesTag] },
  Effect.gen(function*() {
    const notes = yield* Notes
    return ({ note }) =>
      notes.save(note).pipe(
        Effect.match({
          onSuccess: (note) => NoteEditorMessage.SucceededSaveNote({ note }),
          onFailure: (error) => NoteEditorMessage.FailedSaveNote({ reason: error.reason })
        })
      )
  })
) {}
```

A body that leaves a typed error gives an unmatched Command, which `$.run`
rejects.

`Command.map`, `Command.asNoop` and `Command.match` are for a Command that
can't know its caller's messages: one from a library, such as
`Router.replace`, or one that two components issue. `Command.match` maps both
channels of one that can fail:

```ts
Router.replace(AppRoute, route).pipe(Command.map((outcome) => Message.CompletedReplace({ outcome })))
Router.replace(AppRoute, route).pipe(Command.asNoop)
```

In a `Story` or `Scene`, a Command that returns a message resolves with the
message: `s.resolve(SaveNote, NoteEditorMessage.SucceededSaveNote({ note }))`.
A mapped Command takes its own value in `s.resolve`, or its typed error in
`s.fail`, and the mapping runs in the test.

### Changing the Model

`$.evolve` changes some fields of the Model and keeps the rest, so a
handler doesn't spread `...model`. Each field takes its new value, or a
function from its old value to the new one. It returns a step, so `.run`,
`.emit` and another `.evolve` chain after it:

```ts
const submittedOrder = CheckoutDef.update("SubmittedOrder", (model, _message, $) =>
  model.submitting
    ? model
    : $.evolve({ form: submit, submitting: true, attempts: (n) => n + 1, notice: null })
      .run(placeOrder(model.form.values)))
```

`UiStruct.evolve` takes the same fields for a struct inside the Model:
data-first for a row of a list, and data-last for a struct field, where it
takes the struct's type from the field. It also changes the Model in a
handler that returns a bare Model, with no `$`:

```ts
const clickedIncrement = CheckoutDef.update("ClickedIncrement", (_model, { id }, $) =>
  $.evolve({
    lines: Arr.map((line) => line.id === id ? UiStruct.evolve(line, { quantity: (n) => n + 1 }) : line),
    coupon: UiStruct.evolve({ status: "Idle" })
  }))

const failedSaveNote = NoteEditorDef.update(
  "FailedSaveNote",
  (model, { reason }) => UiStruct.evolve(model, { error: reason })
)
```

A misspelt key, a value of the wrong type and a function that returns the
wrong type are errors on that field. TypeScript checks the keys written in
the fields literal, not those of an object built elsewhere and passed in:
a misspelt key there is copied onto the Model. Check fields declared on
their own where they're declared, which also types the updaters:

```ts
const bump = { attempts: (n) => n + 1, notice: null } satisfies UiStruct.EvolveFields<Checkout>
```

Unlike with `Struct.evolve` from
`effect`, a field can't change type. A field takes a whole value, so
`coupon: { status: "Idle" }` is an error: write
`coupon: UiStruct.evolve({ status: "Idle" })`. A function is always the
updater, so a field whose type is a function can't be set through
`evolve`. A Model shouldn't hold a function anyway, since it can't be
encoded for hydration or history.

A function sees only its own field. One that depends on another field
reads the handler's `model`, which is the Model before this step.

`evolve` doesn't take a union, and a nullable struct counts as one. Match
the union first and evolve the member:

```ts
const updatedName = AuthDef.update(
  "UpdatedName",
  (model, { value }) => Auth.match(model, { LoggedOut: (auth) => auth, LoggedIn: UiStruct.evolve({ name: value }) })
)

// A union field in a struct Model, with `match` data-last.
$.evolve({ auth: Auth.match({ LoggedOut: (auth) => auth, LoggedIn: UiStruct.evolve({ name: value }) }) })

// A nullable struct.
$.evolve({ coupon: (coupon) => coupon === null ? null : UiStruct.evolve(coupon, { status: "Idle" }) })
```

A union Model has no `$.evolve`, so a handler that also runs a Command
wraps the match in `$.set(...)`. Switching to another member is a `$.set`
too.

`evolve` is for plain structs, not `Schema.Class` or other class
instances: evolving a changed field returns a plain-object shallow copy,
dropping the prototype even though the static type still exposes class
methods. For a class Model, use `$.set` with a constructor or method that
returns a valid instance.

### Stateless view wrappers

Name view functions in CapitalCase, like components (for example, `Card` and `Field`).

Use `View.H<M>` with `@effect/ui/html/register` for shared HTML view
functions. No separate HTML helper type is needed. When the root is the hole,
return its builder and let the caller add children: `Card(h).children(...)`.
This needs no children generic. `children` returns the builder and a second
call adds after the first, so the function can add children of its own and
still return the builder. For a nested hole, use an options object
and keep its children inferred through `C`:

```ts
import "@effect/ui/html/register"
import type { View } from "@effect/ui"

const Card = <M>(h: View.H<M>) => h.section.class("card")

const Field = <M, C extends View.Children<M>>(h: View.H<M>, options: {
  readonly label: string
  readonly children: C
}) => h.label.children(options.label, h.div.class("control").children(options.children))
```

Pass `children: [child, otherChild]`. The unspread array retains the union
of its children's service requirements. `View.Children<M>` is a generic
constraint, not a parameter annotation: annotating children directly with it
erases requirements. `View.Input<M>` instead rejects service-requiring children.

A nested hole can also stay a builder. `forward` lets the caller's chain
and children land on an element below the root: the function returns the
inner builder, and `forward` says what goes around it when it is built.

```ts
const Framed = <M>(h: View.H<M>) => h.div.class("control").forward((control) => h.div.class("frame").children(control))

// The class and the children land on the control, inside the frame.
Framed(h).class("wide").children(h.input)
```

### Loading data

A component declares the queries it shows in `queries`, by name. Each entry
names a `Query` and returns its args from the Model, the props and the other
queries' results, or `undefined` to disable it:

```ts
queries: {
  note: { query: GetNote, args: (_model, props) => ({ id: props.id }) },
  // Waits for the args to hold still before it fetches.
  results: { query: SearchNotes, debounce: "300 millis", args: (model) => ({ q: model.q }) },
  // One query at many args, one entry per args.
  authors: { queryMany: GetUser, args: (_model, props) => props.authorIds.map((id) => ({ id })) }
}
```

The runtime watches each query and keeps its last result beside the Model. A
result that changes re-renders the instance, without a message. The Model
holds what the user did, and never a copy of fetched data. The Model plus the
results is the instance's state: the server ships it and the history entry
keeps it as `{ model, queries }`, so a hydrated or restored instance starts
with the results it had.

Every function of the component can read the results, by query name:
`h.queries` in `view`, `$.queries` in `update`, and the `queries` argument of
`head(model, props, queries)` and `subscriptions(model, props, queries)`. Give an entry
an `onChange` only when `update` has to react to a new result, such as
moving focus once a query fails. It returns a message, which `update` gets
after the result is written.

The cache never retries a failed fetch: a fetcher that should retry does so
itself.

In tests, `Story` steps such as `loaded("note", note)` take the query's
name and write its result. To start from fetched data without sending
`onChange`'s message, pass the results to `given`:
`s.given(model, { note })`. The `MessageLog` records each result write as a
`QueryChanged` entry, and an `Update` entry only for an `onChange` message.
Each `Mounted` and `Update` entry records the results, restored or hydrated
ones included, so `Story.fromLog` replays `$.queries` as it was. New props from a parent are logged as a
`PropsChanged` entry, so the result's `props` and `queries()` hold what the
instance ended with.

### Slots

A component with a `view` can take markup from its parent in named slots.
List the names in `define` with `slots: ["summary", "body"]`, and place
each one in `view` with `h.slots.body`, once per render. The parent passes
the content when it declares the child, written with its own `h`:

```ts
Collapsible(h, {
  key: "note",
  slots: {
    summary: h.h2(note.title),
    body: NoteEditor(h, { ref: Editor.at(note.id), props: { note }, onEmit: { Saved: () => SavedNote } })
  }
})
```

The content is the parent's. Its handlers send the parent's messages, its
children's events and failures map to the parent's messages, the parent's
`$.send` and refs reach into it, and its services come from where the
parent declared the child, not from the child's Layers. A parent re-render
updates the content without running the child's view. The child decides
whether and where each slot shows. A slot it doesn't place isn't mounted,
and a slot it places again mounts fresh. A slot the parent leaves out shows
nothing. A child in a slot gets a path under the slot, such as
`/NotePage/Collapsible[note]/[body]/NoteEditor[Editor[n1]]`.

Use slots when the child owns the frame and its state, and the parent owns
what goes inside. Use a headless component when the parent draws all the
markup. A component can't have both `slots` and `parts`. In a scene, a
parent's view shows the content it passes, and a scene of the slotted
component passes its own with `yield* Scene.make(Collapsible, props, { slots: (h) => ({ ... }) })`.

### Headless components

A component finished with `parts` instead of `view` is headless: it keeps
its own Model, `update` and Commands, and owns behaviour such as keyboard
handling, ids and ARIA, but no markup. A consumer calls it with `h`
and a `view` closure that applies each part to a builder of its own:
`listbox.trigger(h.button).children("Open")`. The closure is the consumer's code,
so children declared in it report to the consumer. Pass rows as Schema data in
props, and keep richer row content in the closure, looked up by id. The
closure runs whenever the consumer renders, so wrap a headless child in a
small normal component when the consumer renders often. Test one with
`Story.parts`, which needs no runtime, and render it in a `Scene`, which
runs it with a stand-in view for the consumer.

Name the closure's argument after the component, in camel case and in full:
`view: (listbox) => listbox.trigger(h.button)` for a `Listbox`, and
`tooltipProvider` for a `TooltipProvider`. A one-letter name reads like one
the library fixes, such as `h` for builders, `p` in `parts`, `$` in
`update` and `s` for a Scene. When the name is a reserved word, such as
`switch`, use `parts`. When the closure also reads a variable of that name,
add `Parts` (`listboxParts`) or rename the variable. Two of one component
nested get a role in front, `outerDialog` and `innerDialog`. Parts built
outside a closure follow the same rule:
`const listbox = Story.parts(Listbox, { model, props })`.

### Shared state

A headless component with `shares: (model, props) => value` owns shared
state: every component in its `view` closure, at any depth, can read the
value. A reader lists the owners it reads in
`shared: { provider: TooltipProvider }` and reads `h.shared.provider` or
`p.shared.provider` in `view` or `parts`. Any `update` below the owner can
call `$.send(TooltipProvider, message)` with one of the messages the owner
`receives`. Reads and sends put `Component.Shared<"TooltipProvider">`
in a component's requirements, and the owner's closure removes it, so a
reader with no owner of that name above it doesn't compile. Use distinct owner
names: a different definition with the same name satisfies the type, but a
required read still fails at mount. To name the requirement from the component,
use `Component.Shared.Of<typeof TooltipProvider>`. The state is the owner's
Model, so the log records every change. In a `Scene`,
`s.shared(TooltipProvider, value)` or
`s.given(model, {}, [[TooltipProvider, value]])` gives readers a value, and
each send to the owner is acknowledged with
`s.sent(TooltipProvider, message)`.

A component can read its own kind, as a submenu reads the menu it's in:
`shared: { parent: { owner: "self", optional: true } }` reads the nearest
instance of the same component above it. The outermost one has none, so the
entry is `optional: true`, and the component must have `shares` itself. Write
`shares` before `shared`, so `report` and `onChange` are typed by it. In a
`Scene`, the component itself is the owner: `s.shared(Menu, value)`.

Every owner update re-runs its closure, and headless children in it
re-render each time, so put normal components directly under an owner.
Every reader re-renders when the shared value changes, so keep readers few
and the shared value small.

### Mounts

Work that needs an element's host node, such as measuring it or hosting a
chart, map or editor, is a mount. Define it once at module level, like a
Command: `Mount.make(name, { args }, (node, args, changes) => effect)` for
work that ends with one result, or `Mount.makeStream` for work that sends a
result per event for as long as the element lives. Annotate `node` with the
node the body needs. A view issues it with its args and maps the result to a
message: `h.canvas.onMount(DrawChart({ points }).pipe(Mount.map(toMessage)))`.
If the body has nothing to report, end it with `Effect.as(Component.noop)`. An element takes one mount. Args with no real Schema, such as a
callback, need `Schema.declare`. Mounts never run on the server or in
`TestHost`. A `Scene` tracks the mounts in its view:
`expectMount(DrawChart({ points }))` asserts on the rendered args and
acknowledges the mount running, and `mounted(DrawChart, result)` sends what
the body would have produced. A mount nothing acknowledged fails the next message step
and the end of the test.

### Document and window events

Keys and presses that no element hears, such as a game's arrow keys or an
Escape that closes a popup opened by hovering, are entries in
`subscriptions`: `Html.onDocument("keydown", handler, options)`, and
`Html.onWindow("focus" | "blur", handler)` for the window's focus. The
handler and `preventDefault` mean what they mean on an element, and the
payload adds `defaultPrevented`, so a listener can skip a key an element
already took. `capture: true` hears a press before any element can stop it.
Gate an entry on the Model to listen only while it's needed. The listener
always runs the handler from the latest `subscriptions` result, so it may
read the Model. An instance has one listener per target, event and phase.
`BrowserHost.layer` provides the source; elsewhere nothing fires. A
`Story` delivers one with `s.subscription(key, message)`, an `HtmlScene`
fires one with `s.fireDocument("keydown", { key: "Escape" })`, and a
`TestHost` test adds `TestGlobalEvents.layer` and calls
`TestGlobalEvents.fire("document", "keydown", { key: "Escape" })`.

### Forms

Validate a form with `Validation.make`. It takes each field's rules: a
`required` message, a list of rules, and a `value` Schema when the control
holds something other than a string. A rule is a predicate and a message, and
`Validation.Rule` has the common ones, such as `minLength`, `email` and
`fromSchema`. A predicate also gets every value of the form, so a rule like
"passwords must match" is a rule on the confirm field.

The Model holds the form's `State`: the values as typed, which fields were
edited or left, whether a submit was tried, and the server's errors.
`update` records what happened with `change`, `blur`, `submit` and
`reject`. Errors are never stored. `validate(state)` derives each field as
`NotValidated`, `Validating`, `Valid` or `Invalid`, and `value`, which
is `Some` of the values only when every field passes. `view` and `update`
both call it, so write one function that calls it and share it.

The `mode` decides when a field starts showing its result: once it was
edited, once it was left, or, by default, once a submit was tried. A tried
submit shows every field. An error from `reject` shows at once and stays
until its field changes. By default each invalid field stops at its first
failing rule (`errors: "first"`); pass `errors: "all"` to collect every
failing rule and list `field.errors` below the field.

For a list of requirements under a field, such as a password's, call
`checklist(state, "password")`. It gives every rule of the field as
`{ message, met }`, met or not. It ignores the mode, so the list can show
from the first render, and an empty value meets no rule. Write each message
as a requirement that reads right met or unmet. A message that is a function
of the value is called for every rule, with an empty value too.

An async check, such as "is this username taken", is a query whose args
are `undefined` until `passes(state, "username")`. Pass its result to
`validate`, mapped to a list of errors. The field is `Validating` while
the query loads, and `value` is `None`, so a submit waits for the answer.
A query keeps its result per args, so an answer about an earlier value is
never shown. Forms set `novalidate`, so the browser's own checks stay out of
the way.

### Organizing an app

The examples below are one notes app. Each example is an entry module, for
the browser, the server or the tests. It mounts a component and provides the
platform Layers, and it defines no components. The app is in
`ai-docs/src/90_ui/fixtures`, laid out as it would be under `src/` in a real
app. Read an example, then the files it imports.

Group files by feature, then by kind within each feature:

```text
fixtures/
  App.ts                      // root component, imports pages
  routes.ts                   // AppRoute
  kit/Listbox.ts              // headless components no feature owns
  kit/Collapsible.ts          // a component with slots
  notes/
    domain/Note.ts            // Schema, errors, NotesTag
    services/Notes.ts         // service and its Layers
    queries/ListNotes.ts
    queries/GetNote.ts
    queries/SearchNotes.ts
    components/NoteEditor.ts  // NoteEditor and its SaveNote command
    components/NoteActivity.ts
    components/ActivityLog.ts
    components/NoteLinkPicker.ts
  pages/
    NotesIndex.ts             // /
    notes/NotePage.ts         // /notes/:id
    search/SearchPage.ts      // /search
  server/NotesApi.ts          // the JSON API that Notes calls
```

A second feature is a sibling of `notes/`, with its own `domain`, `services`,
`queries` and `components` folders. Pages import features, but features never
import pages. Keep `AppRoute` in `routes.ts`, outside `pages/` and separate
from `App.ts`; pages can then build links without importing the root component
that imports them.

Keep one file per route in `pages/`, in folders that mirror the URL. A page's
folder is the static segments of its route's path, and its file is named after
the component. `/` is `pages/NotesIndex.ts`, `/notes/:id` is
`pages/notes/NotePage.ts`, and `/notes/:id/history` would be
`pages/notes/history/NoteHistoryPage.ts`. A param segment gets no folder. The
folder follows the URL, not the feature the page uses.

A command belongs in the file of the component that runs it, not in a shared
`commands/` folder. When two components need the same write, share the service
method and give each component its own command. Queries have their own folder
because pages, multiple components and server rendering all read them.

A component provides the domain Layers it needs in its own file, with
`Component.provide`: its commands, its queries and the services they capture.
The plain name, such as `NotePage`, is the component with those Layers
provided, and it is the one parents and entry modules use. The component
without them is exported as `NotePageNoDeps`, for a test that provides its
own. A component that needs no domain Layers has only the plain name.

A memoised Layer is built once per Env, the services a component resolves
from. Provides that resolve from the same Env share it, and so do the provides
below them. It is closed when its last user unmounts. Components under
different provided ancestors each build their own copy, so a service built for
one page never sees another page's dependencies. A service that holds state,
such as a session or a sync engine, is provided by the component that owns its
lifetime, usually the root component. The components below keep naming it in
their own provides and get that instance.

Entry modules sit beside these folders. Each one imports
`@effect/ui/html/register` before it renders anything, and provides only
platform Layers such as the Router, the HTTP client and logging. Domain Layers
are never provided there. The server and a test of the whole app swap the HTTP
client, not the services.
