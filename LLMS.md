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
renders the slot with a ref from `Child.ref("Name")`, and its `update` calls
`$.send(ref, message)`. Don't send what the child shows: that belongs in its
props.

### Stateless view wrappers

Use `Component.H<M>` with `@effect/ui/html/register` for shared HTML view
functions. No separate HTML helper type is needed. When the root is the hole,
return its builder and let the caller add children: `card(h).children(...)`.
This needs no children generic. For a nested hole, use an options object
and keep its children inferred through `C`:

```ts
import "@effect/ui/html/register"
import { Component, View } from "@effect/ui"

const card = <M>(h: Component.H<M>) => h.section.class("card")

const field = <M, C extends View.Children<M>>(h: Component.H<M>, options: {
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

The runtime watches each read and keeps its last result in a slot beside the
Model. A slot that changes re-renders the instance, without a message. The
Model holds what the user did, and never a copy of loaded data. The Model plus
the slots is the instance's state: the server ships it and the history entry
keeps it as `{ model, loaded }`, so a hydrated or restored instance starts
with the results it had.

Every function of the component can read the slots, by loader name:
`h.loaded` in `view`, `$.loaded` in `update`, and the `loaded` argument of
`head(model, props, loaded)` and `subscriptions(model, props, loaded)`. Give an entry
an `onChange` only when `update` has to react to a new result, such as
moving focus once a read fails. It returns a message, which `update` gets
after the slot is written.

In tests, `Story` load steps such as `loaded("note", note)` take the loader's
name and write its slot. To start from loaded data without sending
`onChange`'s message, pass the results to `given`:
`s.given(model, { note })`. The `MessageLog` records each slot write as a
`LoaderChanged` entry, and an `Update` entry only for an `onChange` message.
Each `Update` entry records the slots `update` read, so `Story.fromLog`
replays `$.loaded` as it was. New props from a parent are logged as a
`PropsChanged` entry, so the result's `props` and `loaded()` hold what the
instance ended with.

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

- **[Building a component with @effect/ui](./ai-docs/src/10_ui/10_basics.ts)**:
  Build a note editor from Schemas and pure functions, with its update split
  into slices on a `Component.define` definition. It saves through a
  `Command.Service` and autosaves with a Subscription. This is the browser
  entry module, which mounts it with `BrowserHost`. The editor is in
  `fixtures/notes/components/NoteEditor.ts`.
- **[Composing components, data and Layers](./ai-docs/src/10_ui/20_composition.ts)**:
  Load a note with a `Loader` read and show it with child components. The
  page handles a child's events, provides Layers with `Component.provide`,
  and makes one child swappable with `Feature.Service`. This entry module
  mounts the page, which is in `fixtures/pages/notes/NotePage.ts`.
- **[Reusing view functions with children](./ai-docs/src/10_ui/21_view-functions.ts)**:
  Use a plain function for a stateless wrapper. Return the builder when
  its root is the hole, so callers add children without a children generic.
  For a nested hole, take an options object with a generic children field.
- **[Headless components](./ai-docs/src/10_ui/22_headless-components.ts)**:
  Build a filterable listbox that owns its state, keyboard handling and ARIA
  but no markup, and draw it from a consumer that calls it with `h` and a
  `view` closure. This browser entry module mounts the consumer, which is in
  `fixtures/notes/components/NoteLinkPicker.ts`.
- **[Routing and the document head](./ai-docs/src/10_ui/30_routing.ts)**:
  Define typed routes with `Route` and keep the current route in the root's
  Model. The app also sets the title and meta tags with `Head`. This entry
  module mounts it with `BrowserRouter`. The routes are in
  `fixtures/routes.ts` and the root component is in `fixtures/App.ts`.
- **[Search, filters and pagination in the URL](./ai-docs/src/10_ui/35_url-state.ts)**:
  Keep a search page's text, order and page number in the query, so a link
  or a reload shows the same results. The page reads them from its route,
  writes them with `Router.patchQuery`, and fetches with a debounced loader.
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
  Test a component as a pure `Story`, a Command against a fake Layer, and a
  whole tree on `TestHost`. The last test renders on the server and hydrates
  with `ssr`.