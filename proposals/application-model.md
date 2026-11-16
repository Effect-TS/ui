# Effect UI proposal: local Components, one explainable Application Model

## Vision

Retain Effect UI's component and data ergonomics, with the Foldkit Blocks
and Layers preview's principle: the complete Application Model explains the
rendered Document. Components encapsulate behavior; the framework composes
their state and transitions. Queries stay automatic, without application
authors maintaining cache bookkeeping to obtain an explainable state machine.

State changes through pure transitions. Commands describe side effects for
the host to execute, and results return as Messages. Rendering consumes the
prepared state without starting work. Framework automation follows the same
boundary so these guarantees hold for Queries as well as application code.

## What Effect UI does well, and why to retain it

- Components colocate a feature's Model, behavior, data needs, and view.
  Preserve local authoring so decomposition needs less parent wiring.
- Declared Loader reads and a shared cache coordinate loading, deduplication,
  freshness, invalidation, and optimistic updates. Preserve these policies
  so each application does not implement its own data coordinator.
- Typed Commands and replaceable Effect services/Layers support controlled
  execution and different hosts. Preserve them so feature logic is reusable.
- Immutable fluent HTML and component-granular rendering support convenient
  views and selective updates. A complete Model need not sacrifice either.
- SSR can settle declared reads and transfer cache entries; prefetch can
  warm that cache before navigation. Preserve them to reduce duplicate
  initial-fetch wiring and time spent waiting for content.

## Weak points relative to Foldkit's architectural goals

- Local Model is only part of rendering: props, Loader slots, child Models,
  and execution status also matter. Slots can change before an optional
  application Message, so Model plus application Message history does not
  explain the UI without the framework's additional state changes.
- Child creation/disposal follows the rendered tree, coupling presentation
  to state lifetime. Hiding a feature should be able to retain its state
  through an application decision reproducible without a live renderer.
- Head contributions are pure; the final title depends on mounted-tree
  order, overrides, and lifetime. Distributed document policy makes its
  result harder to explain. The concern is ownership, not impure views.
- Current pure Stories stop at child slots. Crossing a component boundary
  requires a runtime test, limiting pure tests of composed behavior.

## What to borrow from Foldkit, and how to adapt it

1. Foldkit's composed Model. For UI, generate an Application aggregate of
   local Models, child identities, props not derived from parent state,
   shared Query state, and render-visible status. One Schema-backed state
   makes saved Models sufficient to reproduce the application-controlled view.
2. Pure composed transitions. Add automatic Query reconciliation to those
   semantics: describe work, then reduce its outcomes as framework Messages.
   This preserves cache convenience with inspectable state changes, without
   application-authored completion handlers for every read.
3. Public child inputs and generated synchronous composition. Parents inform
   children; children own the consequences. Related changes complete in one
   pure application step, preserving autonomy and consistent rendered state.
4. A root Application returning a pure Document. Root ChangedUrl parses the
   URL and explicitly informs children; the root chooses title/metadata from
   Model. This gives navigation and document policy one visible authority.
5. Route biparsers, typed Route unions, and callable URL builders. One parse/
   print definition prevents URL drift without prescribing a component tree.
   Callable Message constructors improve readability while retaining Schemas.
6. Separate graph construction from effect-handler initialization and test
   across the graph. Story/Scene can then exercise real composition with
   controlled work/time, without HTTP clients or a live cache during rendering.
   Construction may use Effects; the acquired state transitions stay pure.
7. Typed field evolution and reusable Steps. Authors supply transformations
   such as `count: Number.increment`; the framework applies them to the current
   field values. This keeps Model evolution concise and preserves unchanged
   field references for predictable component-level rendering.

## Field evolution in the update DSL

Effect UI's immutable Step builder already composes Model transformations,
Commands, and emitted outputs. Add contextual `$.modifyFields(...)` to that
builder so a handler can declare how fields evolve. Keep standalone
`modifyFields` for ordinary pure transformations and reusable helpers.
Changing fields on a Step preserves its accumulated Commands, emitted
outputs, and inferred service requirements.

Each field callback receives that field's current value. Omitted fields keep
their values and references; a payload replacement uses `() => payload`.
Callbacks in one record read the incoming field values. Use sequential Steps
when a later transformation needs the result of an earlier one. These rules
make update order explicit without reconstructing the whole Model.

The contextual helper should reject unknown fields and transformations that
violate field types or Model variant constraints, following the preview's
contract-bound field Steps. Preserve the original Model reference when all
transformed values are unchanged. This catches invalid updates and avoids
unnecessary rendering work. Existing children evolve through their public
operations so field helpers do not bypass the child's invariants.

The preview's `Definition.makeFieldsStep` and `.fromMessage` demonstrate
reusable field Steps with Model and Message inference supplied by the owning
contract. Preserve that capability; evaluate how it fits UI's existing
`Component.update` helpers before choosing the final method names. This lets
larger updates be composed from named operations with useful inferred types.

## SSR and prefetch: the specific difference

Both support SSR/hydration. Foldkit's preview renderer runs init/view without
executing Commands or building the handler graph; fetched data can arrive
through serialized Flags. UI can execute declared reads within a budget and
transfer Models/cache entries. Preserve this: preparing state executes
permitted reads; rendering prepared state is pure.

Prefetch means fetching data before it is needed, for example in the browser
when someone hovers over or focuses a link. It works in a client-only app;
it does not require SSR. The two capabilities can share Query/cache machinery.

UI's navigation prefetch needs an explicit route-to-component declaration.
Discovery walks initial views, with limits. Compatible prefetch syntax needs
design here; its benefit is preparing cached data without navigating or
replacing the active feature.

## Scope and status

This is a non-runnable API sketch. Application, Query, makeLayer, union
helpers, field-evolution helpers, composition, and testing spellings are
proposed. Route/Url examples use preview shapes. Optional/keyed composition
and prefetch need a prototype.
"Query" is a naming suggestion. The preview supplies semantic evidence;
ordinary UI code need not adopt its entire Block/Binding/Composition surface.

References: [Effect UI at `6f5c415`](https://github.com/Effect-TS/ui/tree/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c) and [Foldkit Blocks and Layers preview, PR #1655](https://github.com/foldkit/foldkit/pull/1655), at `54f8bcd`.

## Commented API sketch

```ts
import Assert from "node:assert/strict"

import {
  Application,
  Component,
  defineInMessageUnion,
  defineMessageUnion,
  defineTaggedUnion,
  modifyFields,
  Query,
  Route,
  Url
} from "@effect/ui"
import { Scene, Story } from "@effect/ui/testing"
import { Context, Effect, Equal, Layer, Option, pipe, Result, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

// DOMAIN

const Note = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  body: Schema.String
})
type Note = typeof Note.Type

const NoteReadError = defineTaggedUnion({
  Unavailable: { id: Schema.String }
})
type NoteReadError = typeof NoteReadError.Type

// The live HTTP implementation is intentionally outside this example.
// A browser or server supplies it through a Layer, following ordinary Effect
// service composition. Keeping services out of component transitions lets the
// same state machine run with real HTTP, controlled tests, or server services.
class Notes extends Context.Service<
  Notes,
  Readonly<{
    get: (id: string) => Effect.Effect<Note, NoteReadError>
  }>
>()("example/Notes") {}

// QUERY

// Keep the integrated cache. This follows Effect UI's service-backed read
// pattern; "Query" is a suggested name for the existing Loader concept.
// A shared read identity lets independent components reuse data and work.
// This is a passive service definition. The factory captures Notes when the
// execution host builds GetNote.layer. Component graph construction records
// that requirement without initializing the handler Layer, so composing or
// testing the pure application does not acquire a client or start live work.
class GetNote extends Query.Service<GetNote>()(
  "notes/GetNote",
  {
    args: { id: Schema.String },
    success: Note,
    error: NoteReadError,
    staleTime: "30 seconds"
  },
  Effect.gen(function*() {
    const notes = yield* Notes
    return ({ id }) => notes.get(id)
  })
) {}

// Proposed semantics: the Application owns one cache entry per read and args.
// Its pure Query reducer manages pending state, deduplication, and freshness.
// A fetch or timer is requested as work; its result returns as a framework
// Message. Time needed by a transition arrives explicitly from Effect Clock.
//
// The same mechanism would interpret optimistic patches and invalidation
// declared by mutation Commands. Application authors declare the policies;
// the framework supplies the reducer and bookkeeping. This keeps UI's automatic
// data coordination while making each rendered state reproducible from Model.

// COMPONENT CONTRACT

// These helper exports are proposed additions to Effect UI, based on the
// Foldkit preview. They generate callable variant constructors while
// preserving the Schemas and exhaustive matchers. Each call names the owning
// Message union and fact being reported, so call sites stay readable without
// repeating construction machinery or hand-writing discriminator fields.
const NoteMessage = defineMessageUnion({
  ClickedToggleDetails: {}
})

const NoteInMessage = defineInMessageUnion({
  RequestedCollapse: {},
  InformedOfSelectedNoteChanged: { maybeNoteId: Schema.Option(Schema.String) }
})

const DetailState = Schema.Literals(["Collapsed", "Expanded"])

const toggleDetailState = (detailState: typeof DetailState.Type): typeof DetailState.Type =>
  detailState === "Collapsed" ? "Expanded" : "Collapsed"

const NoteDetailsModel = Schema.Struct({
  maybeNoteId: Schema.Option(Schema.String),
  detailState: DetailState
})

// Like a preview Block contract, this declaration is usable by a parent
// without importing the implementation. A Layer selects the implementation.
// This lets a parent depend on a child's public behavior and tests replace
// implementations without exposing or forwarding private child Messages.
// Ordinary Components also need composition for required, optional, and keyed
// children. Child state creation, identity changes, and removal must be pure
// application transitions so a saved Model explains which child state exists.
// Evaluating HTML consumes those decisions instead of creating missing state.
const NoteDetails = Component.define({
  name: "NoteDetails",
  model: NoteDetailsModel,
  message: NoteMessage,
  inMessage: NoteInMessage,

  // The author declares a data requirement, without writing fetch-completion
  // branches or manually placing a Query Model in every component's Model.
  // Reconciliation evaluates this declaration during a state transition.
  // That keeps ordinary feature code small while giving cache changes a pure,
  // testable transition path. Cached data has one owner across components.
  queries: {
    note: {
      query: GetNote,
      args: (model) =>
        Option.match(model.maybeNoteId, {
          onNone: () => undefined,
          onSome: (id) => ({ id })
        })
    }
  }
})

// COMPONENT IMPLEMENTATION

const noteDetailsLayer = NoteDetails.makeLayer({
  init: () => ({ maybeNoteId: Option.none(), detailState: "Collapsed" }),

  // Add field evolution to UI's immutable Step builder. The helper supplies
  // the current field value and preserves omitted fields, so the handler
  // describes the change without reconstructing Model. It also preserves
  // work and outputs already accumulated on the Step.
  update: {
    ClickedToggleDetails: (_model, _message, $) => $.modifyFields({ detailState: toggleDetailState })
  },

  // Borrow the preview's InMessage contract: a parent can request a public
  // transition without depending on the child's private Message union. The
  // child retains control of its invariants when composed into different apps.
  inMessageUpdate: {
    RequestedCollapse: (_model, _message, $) => $.modifyFields({ detailState: () => "Collapsed" }),

    // The parent reports a relevant fact; the child owns its consequences.
    // A different selected note resets expansion. An unchanged selection
    // preserves it. The Query declaration then derives the required read.
    InformedOfSelectedNoteChanged: (model, { maybeNoteId }, $) =>
      Equal.equals(model.maybeNoteId, maybeNoteId)
        ? model
        : $.modifyFields({
          maybeNoteId: () => maybeNoteId,
          detailState: () => "Collapsed"
        })
  },

  view: (model, h) =>
    // h.queries is a read-only projection of the Application Model being
    // rendered. Reading it neither fetches nor consults a separate live cache.
    // Historical views and server views therefore use the data in that Model.
    Option.match(model.maybeNoteId, {
      onNone: () => h.p("Select a note"),
      onSome: () =>
        AsyncResult.match(h.queries.note, {
          onInitial: () => h.p("Loading note…"),
          onFailure: () => h.p("Could not load this note"),
          onSuccess: ({ value: note }) =>
            h.article(
              h.h1(note.title),
              h.button
                .onClick(NoteMessage.ClickedToggleDetails())
                .children(model.detailState === "Collapsed" ? "Show details" : "Hide details"),
              model.detailState === "Expanded" && h.p(note.body)
            )
        })
    })
})

// APPLICATION CONTRACT AND ROUTING

// Carry forward the preview's Route module, including its biparser DSL.
// Domain Route values are Schemas with callable constructors and matchers.
// The Application host only supplies URL facts; it does not prescribe a
// route table. This keeps parsing, URL construction, and application composition
// independently reusable, with one typed definition for each supported URL.
const AppRoute = Route.defineRouteUnion({
  Note: { noteId: Schema.String },
  NotFound: { path: Schema.String }
})

// One definition parses /notes/42 and builds that URL from { noteId: "42" }.
// Sharing the definition prevents links and URL parsing from drifting apart.
// Custom schemaSegment, query, rest, and parser-composition support belong in
// the same Route module. Their semantics do not depend on Component lifetimes.
// Links and navigation Commands build paths with this callable router; browser
// history changes are effects so pure route handling can be reused in tests.
const noteRouter = pipe(Route.literal("notes"), Route.slash(Route.string("noteId")), Route.mapTo(AppRoute.Note))

const urlToAppRoute = Route.parseUrlWithFallback(Route.oneOf(noteRouter), AppRoute.NotFound)

const AppMessage = defineMessageUnion({
  ChangedUrl: { url: Url.Url },
  ClickedCollapseDetails: {}
})

const LocalModel = Schema.Struct({ route: AppRoute })

// Only the root knows the URL structure. It informs the child about the
// selected note, so the child can also be reused outside a routed application.
const selectedNoteFromRoute = (route: typeof AppRoute.Type) =>
  AppRoute.match<Option.Option<string>>(route, {
    Note: ({ noteId }) => Option.some(noteId),
    NotFound: () => Option.none()
  })

const NotesApplication = Application.define({
  name: "Notes",
  model: LocalModel,
  message: AppMessage,

  // The host supplies the initial Url to init. Later URL changes produce the
  // same top-level ChangedUrl fact used in the preview's Program boundary.
  // The application's own biparser handles URL-to-Route conversion below.
  // One entry point makes navigation follow the same visible state transition
  // path as other application inputs instead of updating child props separately.
  // This excerpt shows the URL-change input. Link requests would retain the
  // preview's onUrlRequest boundary and explicit navigation Commands; the
  // onUrlChange-only configuration here is illustrative Application syntax.
  routing: {
    onUrlChange: AppMessage.ChangedUrl
  },

  // A normal required child relationship, like a preview required-field
  // Binding. "details" is its stable identity and storage position. The
  // framework generates its initialization, delivery, and parent operations.
  //
  // The child exists even when the view does not place its markup. Here its
  // Query is disabled through its Model when no note is selected. Routing and
  // child lifetime are independent decisions made by this Application, so a
  // presentation change does not implicitly erase the feature's local state.
  children: {
    details: {
      component: NoteDetails
    }
  }
})

// APPLICATION IMPLEMENTATION

const notesApplicationLayer = NotesApplication.makeLayer({
  // The registered child initializes before these startup Steps, as in the
  // preview's Composition init plan. Startup and navigation use the same
  // public child input so both paths apply the child's own selection rules.
  // Query reconciliation follows the composed result, avoiding reads for an
  // intermediate selection that the completed transition does not retain.
  init: ({ url }, $) => {
    const route = urlToAppRoute(url)

    return {
      model: { route },
      steps: [
        $.children.details.informOfSelectedNoteChanged({
          maybeNoteId: selectedNoteFromRoute(route)
        })
      ]
    }
  },

  update: {
    // Preserve Foldkit's flow: ChangedUrl updates the root Model, then informs
    // the relevant children. The child's handler decides whether to reset.
    // Both Steps form one pure application transition, so rendering cannot
    // observe the new root Route paired with the child's previous selection.
    // The field helper evolves the Model supplied by the composition. Later
    // Steps see that result, preserving fields another Step may have changed.
    ChangedUrl: (_model, { url }, $) => {
      const route = urlToAppRoute(url)

      return $.combine(
        (stepModel) => modifyFields(stepModel, { route: () => route }),
        $.children.details.informOfSelectedNoteChanged({
          maybeNoteId: selectedNoteFromRoute(route)
        })
      )
    },

    // A generated, synchronous parent Step, following preview Binding
    // operations. The child's next Model joins this application transition.
    // This makes the complete result testable without waiting for a render
    // to locate a child instance and deliver its input.
    ClickedCollapseDetails: (_model, _message, $) => $.children.details.requestCollapse()
  },

  // "model" above declares the root's LOCAL state. The generated
  // NotesApplication.Model is the COMPLETE, Schema-backed application state:
  // root local state, child Models and identities, props unless derivable,
  // shared Query cache, and execution/readiness/failure state affecting output.
  //
  // It is the authoritative input to rendering, not a debugging snapshot
  // assembled afterward from independently mutable component instances.
  // This is what lets replay, tests, and rendering agree on the same state.
  document: (state, h) =>
    AppRoute.match(state.local.route, {
      Note: ({ noteId }) => {
        const note = Query.read(state.queries, GetNote, { id: noteId })

        // Title and child content read the SAME cache snapshot. The root
        // chooses document policy without copying fetched data into local state.
        // One authority makes the title explainable without tracing head-entry
        // precedence through whichever component tree happens to be mounted.
        return {
          title: AsyncResult.isSuccess(note) ? `${note.value.title} · Notes` : "Notes",
          body: h.main(
            h.button.onClick(AppMessage.ClickedCollapseDetails()).children("Collapse details"),
            h.children.details
          )
        }
      },
      NotFound: () => ({
        title: "Page not found · Notes",
        body: h.h1("Page not found")
      })
    })
}).pipe(Layer.provide(noteDetailsLayer))

// EXECUTION BOUNDARY

// Like the preview, graph construction and effect-handler initialization
// need separate contracts. Construction may acquire resources, but the
// acquired init/update/view functions are pure. The executable Application
// carries its Query/Command service requirements to the browser or server host.
//
// The live host provides GetNote.layer, Notes, and its HTTP client. It executes
// requested work and delivers results to the application transition function.
// A test assembles the same graph and resolves work descriptions without
// constructing the live HTTP service, so dependency setup does not force tests
// into real execution. Clients and fibers live outside Model because they
// execute work; Model records the status needed to explain the controlled UI.
//
// Preserve component-level rendering as an optimization. A complete Model
// does not require reevaluating every component after every Message, so this
// state contract need not sacrifice Effect UI's rendering granularity.

// PROPOSED APPLICATION SCENE

// The runner and helper names here are illustrative. The requirement is that
// a Scene crosses component boundaries and uses the real pure Query reducer.
// Query expectations inspect requested work; resolution supplies its typed
// outcome through the same transition path used by the live host. This tests
// the composed behavior without replacing its cache or child coordination.
const testUrl = (path: string) => Option.getOrThrow(Url.fromString(`https://notes.example${path}`))

export const noteScene = Scene.make(
  { application: NotesApplication, layer: notesApplicationLayer },
  { url: testUrl(noteRouter({ noteId: "42" })) },
  (scene) => {
    scene.expectQuery(GetNote, { id: "42" })

    const loadingState = scene.snapshot()

    scene.expectTitle("Notes")
    scene.expectText("Loading note…")

    scene.resolveQuery(
      GetNote,
      { id: "42" },
      Result.succeed({ id: "42", title: "Roadmap", body: "Ship the next version" })
    )

    scene.expectTitle("Roadmap · Notes")
    scene.click("Show details")
    scene.expectText("Ship the next version")

    const expandedState = scene.snapshot()

    scene.click("Collapse details")
    scene.expectNoText("Ship the next version")

    // This is the central contract to prove: rendering earlier application
    // state uses earlier Query data AND child Models. Checking only the title
    // would miss a child view accidentally reading the current cache.
    const liveState = scene.snapshot()
    const livePendingWork = scene.pendingWork()
    const loadingDocument = scene.document(loadingState)

    Assert.equal(loadingDocument.title, "Notes")
    Assert.match(Scene.textOf(loadingDocument.body), /Loading note/)
    Assert.doesNotMatch(Scene.textOf(loadingDocument.body), /Roadmap/)

    const expandedDocument = scene.document(expandedState)

    Assert.match(Scene.textOf(expandedDocument.body), /Ship the next version/)

    // Historical evaluation must leave live state and pending work unchanged
    // so inspecting an earlier Model cannot alter the running application.
    Assert.deepEqual(scene.snapshot(), liveState)
    Assert.deepEqual(scene.pendingWork(), livePendingWork)
  }
)

// PROPOSED APPLICATION STORY

// Story uses the same composition and Query transitions without interactions.
// A navigation Message informs the child and derives its data requirements.
// Returning to a fresh cache entry needs no application-authored loading Step.
// This checks that automatic caching survives composition and navigation,
// rather than requiring each parent to implement a request lifecycle.
export const noteStory = Story.make(
  { application: NotesApplication, layer: notesApplicationLayer },
  { url: testUrl(noteRouter({ noteId: "42" })) },
  (story) => {
    story.expectQuery(GetNote, { id: "42" })
    story.resolveQuery(
      GetNote,
      { id: "42" },
      Result.succeed({ id: "42", title: "Roadmap", body: "Ship the next version" })
    )

    story.message(
      AppMessage.ChangedUrl({
        url: testUrl("/missing")
      })
    )
    story.message(
      AppMessage.ChangedUrl({
        url: testUrl(noteRouter({ noteId: "42" }))
      })
    )
    story.expectNoQuery(GetNote, { id: "42" })
  }
)

// Both runners should expose pending work and controlled time. Neither should
// require per-query application completion handlers or execute the live fetch,
// so freshness, races, and failure paths are repeatable without network timing.
//
// Preserve UI's data-aware SSR with the same engine: execute permitted read
// work within a budget, reduce results, then render and transfer eligible state.
// This avoids duplicating initial fetch coordination in a server entry. Pure
// rendering need not adopt the preview's Flags-based state reconstruction.
//
// Other applications may need optional children or collections keyed by domain
// identity. Those relationships need the same Model and lifecycle contract as
// the required child shown here so presentation does not hide state creation
// or deletion. Their final authoring syntax is open.
// Runtime refs, listeners, and resource handles stay outside Model. Any status
// shown by a view must be in Model or purely derived from it, so live resources
// do not become another source of rendered application state.
```

## Source references

### Foldkit preview semantics

- [Block composition and public contracts](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/block.md)
- [Field evolution and structural sharing](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/foldkit/src/struct/index.ts)
- [Reusable field Steps](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/foldkit/src/block/fieldStep.ts)
- [Query transitions and freshness](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/query.md)
- [Runtime and host boundaries](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/runtime.md)
- [Server rendering and Flags handoff](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/serverRendering.md)
- [Query testing](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/snippet/queryInputTesting.ts)
- [Routing and navigation](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/routing.md)
- [Route biparsers](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/foldkit/src/route/parser.ts)

### Existing Effect UI behavior

- [Component contracts](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Component.ts)
- [Loader and cache coordination](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Loader.ts)
- [Component and Loader runtime](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/internal/runtime.ts)
- [Document head contributions](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Head.ts)
- [Pure component Stories](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/testing/Story.ts)
- [Server data preparation and hydration](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/html/HtmlServer.ts)
- [Navigation and prefetch](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Router.ts)
