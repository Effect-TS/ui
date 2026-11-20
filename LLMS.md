# Effect UI documentation

This documentation covers `@effect/ui`, a frontend framework for Effect, and
its related packages.

When you need to find information about Effect UI, use this documentation and
the `@effect/ui` and `effect` source code available in your environment.
Avoid unrelated copies of these libraries or external documentation, as they
may be outdated or incorrect.

**Note**: The examples in this documentation contain comments for illustration
purposes. In practice, you would not include these comments in your code.

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

### Choosing a lifetime

Every `Component.define` takes `lifetime: "view"` or `lifetime: "model"`.
It says how long the component's Model lives.

A `"view"` component is called in a view, `NoteEditor(h, { key, props })`,
and lives while the view renders it. A child the view stops declaring
unmounts and loses its Model. Pick `"view"` for most components: rows,
inputs, menus, anything whose state is fine to lose when it goes away.

A `"model"` component lives as long as its parent lists it. The parent
lists it in `children` in `make`, with props as a function of the parent's
Model, and its view places it with `h.children`:

```ts
const Settings = SettingsDef.make({
  children: {
    profile: Child.one(Profile, { props: (model) => ({ user: model.user }), onEmit: (e) => SavedProfile(e) }),
    billing: Billing,
    step: Child.optional(Step, { props: (model) => model.visited ? {} : null }),
    rows: Child.keyed(Row, { props: (model) => model.ids.map((id) => [id, { id }]) })
  },
  init: () => ({ tab: "profile", user, visited: false, ids: [] }),
  update,
  view: (model, h) => h.main(model.tab === "profile" ? h.children.profile() : h.children.billing())
})
```

A listed child that no tree of the parent places keeps its Model, its
Commands in flight, its Subscriptions and what the user typed. That holds
wherever the view leaves it out: not in what the view returns, under a root
that is another component, or in a slot whose receiver doesn't show it. Its
nodes are kept out of the document, its element mounts stop until it's placed again, and the
log records `Detached` and `Attached`. It still gets props, sends and query
results, and emits through `onEmit`. Pick `"model"` for a tab, a wizard
step or a panel the user comes back to and expects to find as they left
it. The mounted root may be either. A `"model"` route page is listed with
`Child.keyed` on its route's path, `props: (model) => [[AppRoute.printPath(model.route), props]]`,
and placed with `h.children.page(path)`: it lives as long as the route, and keeps its Model while
the view shows something else in its place.

- `Child.one(C, options)` is always listed. A bare `C` is `Child.one(C)`.
- `Child.optional(C, options)` is listed while `props` returns props, and
  removed when it returns `null`, `undefined` or `false`. List a wizard
  step once it has been visited, not every step up front.
- `Child.keyed(C, options)` lists one child per `[key, props]` entry, placed
  with `h.children.rows(key)`.

`onEmit` gets the event and the parent's Model as it is when the event
arrives, shown or hidden: `onEmit: (event, model) => model.tab === "profile" ? Saved(event) : SavedInBackground(event)`.
A view closure that read the parent's state to map an event moves into
this second argument, or into the parent's `update`.

A `"model"` child's ref is named by its key in `children`:
`Profile.ref("profile")`, and `Row.ref("rows").at(id)` for a keyed row.
A send to a child the Model doesn't list is dropped.
`Story` runs listed children with their parent: `s.children.profile` reads
a child's Model, shown or hidden, and `.sendChild("profile", message)`
delivers a message to it. Their events from `init` and `update` reach the
parent through `onEmit`, as in the renderer.

Two limits apply for now:

- A Story runs a listed child's `init`, `update` and `view`, not its
  effects. It fails when a listed child runs a Command or sends to anything
  but its own listed children. Test those in the child's own Story, which
  resolves its Commands and acknowledges its sends, or test the parent with
  `TestHost`.
- `h.children` exists only in the view written in `make`. A view written
  with `Def.view` or typed with `Component.Helper<typeof Def>` doesn't
  have it: place the child in `make`'s view and pass the placed child to the
  other view as an argument.

Calling a `"model"` component in a view, or listing a `"view"` component in
`children`, is a type error. A headless component is always `"view"`.

A listed child costs what a shown one does, about 8 KiB for a hidden row.
In a virtualised list, use `"view"` rows, or remove rows from `children`.
Gate a hidden child's Subscriptions on its Model when they should pause.
A dialog or popover open inside it closes when it's hidden.

An item that can move between parents, such as a card between board
columns, is listed on the parents' common ancestor. Which column it sits
in is plain Model data there, and each column's content places the cards
the ancestor passes it through slots.

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

Map each `Command.Service` to its messages once, beside the Message union,
and call that function from `update`. A result is mapped where the Command
is issued, so nothing else ties `SaveNote` to `SucceededSaveNote`:

```ts
const saveNote = (note: Note) =>
  SaveNote.make({ note }).pipe(Command.match({
    onSuccess: (note) => NoteEditorMessage.SucceededSaveNote({ note }),
    onFailure: (error) => NoteEditorMessage.FailedSaveNote({ reason: error.reason })
  }))
```

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
whether and where each slot shows. A slot it stops placing is kept out of
the document, as an unplaced `"model"` child is, and comes back as it was when it
places the slot again. A slot it never placed isn't created. A slot the
parent leaves out shows nothing. A child in a slot has the path of the
parent that wrote it and its own segment, wherever it's placed, such as
`/NotePage/NoteEditor[Editor[n1]]`. Back and forward restore a slot's
content only if the slot is open when the page renders again. Content left
in a closed slot starts fresh when the slot opens.

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
`m.trigger(h.button).children("Open")`. The closure is the consumer's code,
so children declared in it report to the consumer. Pass rows as Schema data in
props, and keep richer row content in the closure, looked up by id. The
closure runs whenever the consumer renders, so wrap a headless child in a
small normal component when the consumer renders often. Test one with
`Story.parts`, which needs no runtime, and render it in a `Scene`, which
runs it with a stand-in view for the consumer.

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

- **[Building a component with @effect/ui](./ai-docs/src/10_ui/10_basics.ts)**:
  Build a note editor from Schemas and pure functions, with its update split
  into slices on a `Component.define` definition. It saves through a
  `Command.Service` and autosaves with a Subscription. This is the browser
  entry module, which mounts it with `BrowserHost`. The editor is in
  `fixtures/notes/components/NoteEditor.ts`.
- **[Composing components, data and Layers](./ai-docs/src/10_ui/20_composition.ts)**:
  Load a note with a `Query` and show it with child components. The
  page handles a child's events, provides Layers with `Component.provide`,
  makes one child swappable with `Feature.Service`, and passes its editor
  into another component's slot. This entry module
  mounts the page, which is in `fixtures/pages/notes/NotePage.ts`.
- **[Reusing view functions with children](./ai-docs/src/10_ui/21_view-functions.ts)**:
  Name view functions in CapitalCase, like components.
  Use a plain function for a stateless wrapper. Return the builder when
  its root is the hole, so callers add children without a children generic.
  For a nested hole, take an options object with a generic children field,
  or return the inner builder with `forward`.
- **[Headless components](./ai-docs/src/10_ui/22_headless-components.ts)**:
  Build a filterable listbox that owns its state, keyboard handling and ARIA
  but no markup, and draw it from a consumer that calls it with `h` and a
  `view` closure. This browser entry module mounts the consumer, which is in
  `fixtures/notes/components/NoteLinkPicker.ts`.
- **[Shared state](./ai-docs/src/10_ui/23_shared-state.ts)**:
  Share part of a headless component's state with every component below it:
  a tooltip provider that knows which tooltip is open, tooltips that read it
  and tell it when they're focused, and a scene of one tooltip with no
  provider mounted. Then an optional owner, the reports readers give it, a
  reader's `onChange`, and a component that reads its own kind.
- **[Mounts](./ai-docs/src/10_ui/24_mounts.ts)**:
  Start work with an element's host node: a mount that measures a box once,
  a mount that attaches a third-party editor and reports each change, and a
  scene that names both by their definitions.
- **[Document and window events](./ai-docs/src/10_ui/25_document-events.ts)**:
  Listen for keys on the document while a game runs, test it in a scene,
  and press a key in a whole-app test.
- **[Children that outlive their place in the view](./ai-docs/src/10_ui/26_model-children.ts)**:
  Keep a hidden tab's draft: give the tab `lifetime: "model"`, list it in
  its parent's `children`, and place it with `h.children`. A Story runs the
  parent with its listed children, hidden ones included.
- **[Routing and the document head](./ai-docs/src/10_ui/30_routing.ts)**:
  Define typed routes with `Route` and keep the current route in the root's
  Model. Each page's `head` option sets its title with `Head` and its meta
  tags with `HtmlHead`. The root adds a title template and `lang`, and the
  mount folds them into one document head. This entry
  module mounts it with `BrowserRouter`. The routes are in
  `fixtures/routes.ts` and the root component is in `fixtures/App.ts`.
- **[Search, filters and pagination in the URL](./ai-docs/src/10_ui/35_url-state.ts)**:
  Keep a search page's text, order and page number in the search, so a link
  or a reload shows the same results. The page reads them from its route,
  writes them with `Router.patchSearch`, and fetches with a debounced query.
  This entry module mounts the routed app. The page is in
  `fixtures/pages/search/SearchPage.ts`.
- **[Rendering on the server](./ai-docs/src/10_ui/40_server-rendering.ts)**:
  Serve the routed app's pages with `layerHttp` from
  `@effect/ui/html/HtmlServerHttp`, next to the JSON API. This is the
  server's entry module. It serves the same `fixtures/App.ts` the browser
  mounts, and the JSON API in `fixtures/server/NotesApi.ts`.
- **[Hydrating in the browser](./ai-docs/src/10_ui/45_hydration.ts)**:
  Hydrate what the server rendered with `BrowserHost`. This is the browser
  entry module of the server-rendered app, served as `/client.js`.
- **[Testing @effect/ui components](./ai-docs/src/10_ui/50_testing.ts)**:
  Test a component's logic as a `Story` and its view as a `Scene`, a Command
  against a fake Layer, and a whole tree on `TestHost`. The last test renders on the server and hydrates
  with `ssr`.