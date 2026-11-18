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
value. A reader lists the owners it reads in `shared: { tips: Provider }` and
reads `h.shared.tips` or `p.shared.tips` in `view` or `parts`. Any
`update` below the owner can call `$.send(Provider, message)` with one of the
messages the owner `receives`. Reads and sends put
`Component.Shared<typeof Provider>` in a component's requirements, and the
owner's closure removes it, so a reader with no owner above it doesn't
compile. The state is the owner's Model, so the log records every change. In
a `Scene`, `s.shared(Provider, value)` or
`s.given(model, {}, [[Provider, value]])` gives readers a value, and each send
to the owner is acknowledged with `s.sent(Provider, message)`.

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
message: `h.canvas.onMount(Draw({ points }).pipe(Mount.map(toMessage)))`.
End a mount with nothing to send with `Component.noop`. An element takes one
mount. Args with no real Schema, such as a callback, need `Schema.declare`.
Mounts never run on the server or in `TestHost`. A `Scene` tracks the mounts
in its view: `expectMount(Draw({ points }))` asserts on the rendered args and
acknowledges the mount running, and `mounted(Draw, result)` sends what the body
would have produced. A mount nothing acknowledged fails the next message step
and the end of the test.

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
  For a nested hole, take an options object with a generic children field.
- **[Headless components](./ai-docs/src/10_ui/22_headless-components.ts)**:
  Build a filterable listbox that owns its state, keyboard handling and ARIA
  but no markup, and draw it from a consumer that calls it with `h` and a
  `view` closure. This browser entry module mounts the consumer, which is in
  `fixtures/notes/components/NoteLinkPicker.ts`.
- **[Shared state](./ai-docs/src/10_ui/23_shared-state.ts)**:
  Share part of a headless component's state with every component below it:
  a tooltip provider that knows which tooltip is open, tooltips that read it
  and tell it when they're focused, and a scene of one tooltip with no
  provider mounted.
- **[Mounts](./ai-docs/src/10_ui/24_mounts.ts)**:
  Start work with an element's host node: a mount that measures a box once,
  a mount that hosts a third-party editor and reports each change, and a
  scene that names both by their definitions.
- **[Routing and the document head](./ai-docs/src/10_ui/30_routing.ts)**:
  Define typed routes with `Route` and keep the current route in the root's
  Model. The app also sets the title and meta tags with `Head`. This entry
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