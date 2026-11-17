## Building user interfaces with `@effect/ui`

`@effect/ui` is a frontend framework whose apps are composed with Layers. You
describe a component with Schemas for its props, Model, messages and events,
and with pure `init`, `update` and `view` functions. Side effects are Commands
and Subscriptions that the runtime runs for you, and data comes from `Loader`
reads, also in `@effect/ui`. `@effect/ui/html` adds the HTML elements, the
browser host and router, and server rendering.

A `Command.Service` may omit `invalidates` when it invalidates no reads.
Provide a feature implementation with `NoteActivity.toLayer(ActivityLog)`.
Declare a child component by calling it with the parent's `h`:
`NoteEditor(h, { key, props, onEmit })`. Render a feature service with its
`render`, `NoteActivity.render(h, { key, fallback })`, and include a
`fallback` for loading or failure; a component child may omit it.

A parent passes a child state through props, and a child answers through
`events`. A one-shot instruction, such as "save now" or "clear your draft",
is a send: the child lists the tags it accepts in `receives`, the parent
renders the child with a ref from `Child.ref("Name")`, and its `update` calls
`$.send(ref, message)`. Don't send what the child shows: that belongs in its
props.

### Stateless view wrappers

Name view functions in CapitalCase, like components (for example, `Card` and `Field`).

Use `View.H<M>` with `@effect/ui/html/register` for shared HTML view
functions. No separate HTML helper type is needed. When the root is the hole,
return its builder and let the caller add children: `Card(h).children(...)`.
This needs no children generic. For a nested hole, use an options object
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

### Loading data

A component declares the reads it shows in `loaders`, by name. Each entry
names a read and returns its args from the Model, the props and the other
loaders' results, or `undefined` to disable it:

```ts
loaders: {
  note: { load: GetNote, args: (_model, props) => ({ id: props.id }) },
  // Waits for the args to hold still before it fetches.
  results: { load: SearchNotes, debounce: "300 millis", args: (model) => ({ q: model.q }) },
  // One read at many args, one entry per args.
  authors: { loadMany: GetUser, args: (_model, props) => props.authorIds.map((id) => ({ id })) }
}
```

The runtime watches each read and keeps its last result in the loader's state,
beside the Model. A loader state that changes re-renders the instance, without
a message. The Model holds what the user did, and never a copy of loaded data.
The Model plus the loader state is the instance's state: the server ships it
and the history entry keeps it as `{ model, loaderState }`, so a hydrated or restored instance starts
with the results it had.

Every function of the component can read the loader state, by loader name:
`h.loaded` in `view`, `$.loaded` in `update`, and the `loaded` argument of
`head(model, props, loaded)` and `subscriptions(model, props, loaded)`. Give an entry
an `onChange` only when `update` has to react to a new result, such as
moving focus once a read fails. It returns a message, which `update` gets
after the loader's state is written.

In tests, `Story` load steps such as `loaded("note", note)` take the loader's
name and write its loader state. To start from loaded data without sending
`onChange`'s message, pass the results to `given`:
`s.given(model, { note })`. The `MessageLog` records each loader state write as a
`LoaderChanged` entry, and an `Update` entry only for an `onChange` message.
Each `Update` entry records the loader state `update` read, so `Story.fromLog`
replays `$.loaded` as it was. New props from a parent are logged as a
`PropsChanged` entry, so the result's `props` and `loaded()` hold what the
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
    body: NoteEditor(h, { ref: Editor.at(note.id), props: { note }, onEmit: () => Saved })
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
markup. A component can't have both `slots` and `parts`. In a story, a
parent's view shows the content it passes, and a story of the slotted
component passes its own with `Story.make(Collapsible, props, { slots: (h) => ({ ... }) }, f)`.

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
`Story.parts`, which needs no runtime.

### Shared state

A headless component with `shares: (model, props) => value` owns shared
state: every component in its `view` closure, at any depth, can read the
value. A reader lists the owners it reads in `shared: { tips: Provider }` and
reads `h.shared.tips` or `p.shared.tips` in `view` or `parts`. Any
`update` below the owner can call `$.send(Provider, message)` with one of the
messages the owner `receives`. Reads and sends put
`Component.Shared<typeof Provider>` in a component's requirements, and the
owner's closure removes it, so a reader with no owner above it doesn't
compile. The state is the owner's Model, so the log records every change. In
a `Story`, `s.shared(Provider, value)` or
`s.given(model, {}, [[Provider, value]])` gives readers a value, and sends to
the owner are in `sent`.

Every owner update re-runs its closure, and headless children in it
re-render each time, so put normal components directly under an owner.
Every reader re-renders when the shared value changes, so keep readers few
and the shared value small.

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
    loaders/ListNotes.ts
    loaders/GetNote.ts
    loaders/SearchNotes.ts
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
`loaders` and `components` folders. Pages import features, but features never
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
method and give each component its own command. Loaders have their own folder
because pages, multiple components and server rendering all read them.

A component provides the domain Layers it needs in its own file, with
`Component.provide`: its commands, its loaders and the services they capture.
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
