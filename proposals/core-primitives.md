# Core primitives in the proposed API

The proposed Application is a composition of Foldkit's state-machine principles
and Effect UI's component, data, and rendering APIs. Mounts, Subscriptions,
ManagedResources, and browser capabilities retain distinct responsibilities.
Each exists because it owns a different kind of work or lifetime.

The [application proposal](application-model.md) sketches the main loop. This
map covers all 34 entries in the Foldkit Blocks and Layers preview's Core
sidebar at `54f8bcd`. It records recommended contracts and design gaps;
it does not claim these integrations are implemented or their API names final.

## One Model and an execution boundary

The complete Application Model determines the application-controlled Document
description, including child views, Query projections, and visible lifecycle
status. Pure transitions also determine desired state-driven work. Browser
effects run when the host interprets those descriptions, and reported facts
return through Messages before changing application state.

Live elements, clients, fibers, and acquired resource handles stay at the
execution boundary. Their existence does not authorize a view to consult live
mutable state. A measurement that affects rendering becomes a Message and a
Model value. Browser focus, scroll, and arbitrary third-party widget internals
are not automatically reconstructible from an Application Model.

Pure historical Document evaluation starts no effect work. Displaying that
Document in a browser still requires host reconciliation, which can insert
elements, repaint a canvas, and run element cleanup. Historical display and
live application execution need an explicit policy, as in Foldkit's preview.

## Choose work by its cause and lifetime

| Primitive              | What causes it                                                           | Lifetime and result                                                                                    |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Command                | An update requests an operation.                                         | Explicit work, cancellation, and concurrency policy; outcomes return as Messages.                      |
| Subscription           | Model-derived dependencies request an ongoing stream or scoped behavior. | Keep while dependencies match; stop or restart when they change.                                       |
| ManagedResource        | Model-derived requirements request a handle that other operations use.   | Acquire and release with those requirements; report lifecycle facts through Messages.                  |
| [Mount][foldkit-mount] | A rendered element exists and work needs that live element.              | Acquire after commit; release when the element or its owning occurrence retires.                       |
| [Query][foldkit-query] | A declaration requests data for particular arguments.                    | Framework transitions coordinate the shared cache and read work, including freshness and invalidation. |
| Layer                  | Assembly selects a service or handler implementation.                    | The host builds it in its declared Scope; that Scope is distinct from individual operations.           |

These boundaries preserve a useful choice. A dialog opening can request a focus
Command. An element observer belongs in a Mount. A connection shared by several
Commands can be a ManagedResource. Ordinary shared API clients belong in Layers.

## Mount in particular

Effect UI already has `ElementBuilder.onMount`: it records an Effect that the
host runs with the committed element. Its Scope survives patches and closes
when the element is removed. Keep that browser boundary and preserve Foldkit's
typed, named Mount contracts for reusable integrations, diagnostics, and tests.

The recommended contract is:

1. The pure view attaches a Mount description. Constructing it performs no work.
2. The browser host supplies the live element after commit and acquires the
   integration in a Scope. Resource creation belongs inside the acquire Effect
   so interruption cannot bypass its registered cleanup.
3. Setup can report a declared Message. Observers and listeners must also be
   able to report a continuing Stream of Messages; only update changes Model.
4. Stable element and component-occurrence identity retain the acquisition.
   Removal or ownership retirement runs cleanup before replacement setup.
5. Handler dependencies come from the selected Layers. An integration can be
   tested through controlled services while retaining its real setup/cleanup.

Element lifetime and child state lifetime are separate. Hiding a retained child
removes its elements and releases their Mounts. The child's Model remains, and
its state-driven Subscriptions or ManagedResources follow their own conditions.
An application can explicitly deactivate those lifecycles without deleting
the child's remembered state.

The preview captures ordinary Mount args at acquisition. UI additionally offers
an explicit input Stream for later rendered inputs. Retain the distinction
between initial args and reactive inputs so integrations do not accidentally
hold stale values or read the current application behind a historical view.

There are substantive gaps to resolve. UI's current `onMount` returns one
Message or a no-result marker; it cannot emit Messages continuously while its
Effect runs. The proposed API needs streaming Mount results, named typed
handler registration, and whole-application Scene support. A meaningful
completion can remain a `Completed*` Message even when update changes nothing,
so tests and diagnostics can observe the work.

### A one-shot Mount using the proposed component API

`makeLayer`, union constructors, and `$.modifyFields` are proposed authoring
APIs. The `onMount(name, run)` shape below comes from current Effect UI. The
example measures initial geometry; later Message-driven measurements would
use a Command. It does not specify the streaming Mount or handler registry API.

```ts
import { Component, defineMessageUnion } from "@effect/ui"
import { Effect, Option, Schema } from "effect"

const PanelModel = Schema.Struct({ maybeInitialWidth: Schema.Option(Schema.Number) })

const PanelMessage = defineMessageUnion({
  CompletedMeasureInitialPanelWidth: { width: Schema.Number }
})

const MeasuredPanel = Component.define({
  name: "MeasuredPanel",
  model: PanelModel,
  message: PanelMessage
})

const measuredPanelLayer = MeasuredPanel.makeLayer({
  init: () => ({ maybeInitialWidth: Option.none() }),

  update: {
    CompletedMeasureInitialPanelWidth: (_model, { width }, $) =>
      $.modifyFields({ maybeInitialWidth: () => Option.some(width) })
  },

  // The view records an Effect. The host runs it after commit so the element
  // has live geometry; evaluating this view alone never measures the DOM.
  view: (model, h) =>
    h.div
      .onMount("MeasureInitialPanelWidth", (element) =>
        Effect.sync(() =>
          PanelMessage.CompletedMeasureInitialPanelWidth({
            width: element.getBoundingClientRect().width
          })
        ))
      .children(
        Option.match(model.maybeInitialWidth, {
          onNone: () => "Measuring panel…",
          onSome: (width) => `Initial width: ${width}`
        })
      )
})
```

The measured width becomes Model data through a Message. An earlier Model can
therefore reproduce the corresponding text without remeasuring a live element.
Applying an earlier Document to a browser is a separate host operation.

## ManagedResources require an explicit design

UI's component-provided Layers do not replace this primitive. Layer sharing
and build lifetime do not express reacquisition whenever Model requirements
change. Preserve a resource registry and typed accessor, backed by Effect
Scopes and Layers:

- `None` requirements mean absent; `Some(params)` requests an acquisition.
- Changed requirements release the old handle before acquiring its replacement.
- Acquisition, release, and expected failure report Messages. Any readiness or
  failure used by a view belongs in the complete Model.
- Commands look up the current handle when invoked, with typed unavailability
  handling; the handle is not captured while its application handler is built.
- Optional and keyed child occurrences own independent resource lifetimes.
- Deactivation does not automatically cancel a Command already using a handle.
  Cancellation and release ordering need explicit policy and tests.

This preserves Model-driven resource ownership and safe reuse across operations.
The resource registry, accessor, and handler-registration syntax are open.

## Complete Core topic map

**Sketch** means the main proposal illustrates the direction. **Carry** means
retain a preview capability through an adapter or library API; parity has not
been implemented. **Design** marks a substantial integration decision still
required. These labels describe proposal coverage, not implementation status.

| Foldkit Core topic                                 | Proposed behavior and reason                                                                                                                                                                                                                   | Coverage |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [Architecture][foldkit-architecture]               | One composed Model, pure transitions, and hosts interpreting work. Component encapsulation preserves a single explainable application.                                                                                                         | Sketch   |
| [Counter Example][foldkit-counter-example]         | The same small Model/Message/update/view loop, with field evolution such as `count: Number.increment`. A basic feature needs no Query or resource machinery.                                                                                   | Sketch   |
| [Model][foldkit-model]                             | Generate the complete Schema-backed aggregate of local Models, child identities, Query data, and visible status. Views consume that state instead of live instances.                                                                           | Sketch   |
| [Messages][foldkit-messages]                       | Keep callable Schema-backed unions, exhaustive matching, private child delivery, and public inputs/outputs. Record framework Query and lifecycle facts too, so the causal history is inspectable.                                              | Sketch   |
| [Update][foldkit-update]                           | Use pure local field transformations, generated child operations, and sequential Steps. Preserve accumulated work and useful type inference while keeping child invariants with the child.                                                     | Sketch   |
| [View][foldkit-view]                               | Keep UI's fluent immutable HTML. Local views read snapshot projections; the root returns Document metadata and body so one authority explains application-wide output.                                                                         | Sketch   |
| [Commands][foldkit-commands]                       | Keep typed named operations, service-backed handlers, failure-to-Message mapping, concurrency, grouping, and interruption. Specify operation ownership and late-result policy explicitly; current UI service Commands can outlive a component. | Design   |
| [Subscriptions][foldkit-subscriptions]             | Adapt UI's keyed Streams to desired dependencies derived from composed state. Stop removed scopes before starting replacements, independently of whether a retained child renders markup.                                                      | Carry    |
| [Init & Flags][foldkit-init-flags]                 | Decode external startup input, run pure child/root initialization, retain startup work, then apply ordered Steps. Carry Flags separately from services so initial state stays deterministic.                                                   | Sketch   |
| [Block][foldkit-block]                             | Components take the preview's public-contract and generated-composition role. Parent inputs and child outputs retain encapsulation; optional/keyed storage and activation need a complete design.                                              | Design   |
| [Runtime][foldkit-runtime]                         | A pure application engine feeds browser, server, and test hosts. Hosts own execution, startup, hydration, and teardown; importing a component does not start it.                                                                               | Sketch   |
| [Server Rendering][foldkit-server-rendering]       | Keep UI's request-scoped read preparation, budget, and eligible state/cache handoff. Render prepared state purely; do not start element Mounts or arbitrary application Commands on the server.                                                | Sketch   |
| [Embedding][foldkit-embedding]                     | Preserve container-only hosting, disposal, and Schema-typed inbound/outbound Ports. Document and URL ownership must be explicit so an embedded feature respects its host.                                                                      | Design   |
| [Routing & Navigation][foldkit-routing-navigation] | Retain Route biparsers, URL builders, root `ChangedUrl`, link-request Messages, and navigation Commands. Explicit child informing keeps routes independent of component composition.                                                           | Sketch   |
| [View Transitions][foldkit-view-transitions]       | A browser-host policy wraps the actual commit, using the triggering fact and previous/next rendered Models. This coordinates snapshots and timing without starting transitions inside view.                                                    | Carry    |
| [Mount][foldkit-mount]                             | Keep element-scoped acquire/cleanup, declared results, and streaming observations. Add typed handler and Scene integration; retain UI's explicit reactive-input capability.                                                                    | Design   |
| [CustomElement][foldkit-customelement]             | Preserve Schema-typed properties and CustomEvent payloads as a browser-vocabulary binding. Properties derive from Model and events become Messages, avoiding unnecessary imperative Mounts.                                                    | Carry    |
| [Dom][foldkit-dom]                                 | Keep typed ref/id-based Effects and browser Streams. UI already has ref-based focus/blur/scroll/measure Commands; port the broader helper set and its typed failures and timing guarantees.                                                    | Carry    |
| [Render][foldkit-render]                           | Preserve after-commit and after-paint Effects as host capabilities. Measurement and animation work must await the relevant actual commit, including a View Transition.                                                                         | Carry    |
| [Canvas][foldkit-canvas]                           | Retain pure scene data, pointer-to-Message wiring, and host repainting from each scene. A canvas integration must reproduce the declared frame instead of accumulating application state in drawing commands.                                  | Carry    |
| [File][foldkit-file]                               | Retain picker/read Effects and typed file input/drop payloads. The preview permits an opaque native File in Model; snapshot transport and restoration need an explicit policy rather than a blanket serializability claim.                     | Design   |
| [Http][foldkit-http]                               | Keep an Effect HttpClient provider and typed decoding/error boundaries beneath Commands and Queries. Carry browser-safe trace-header defaults so tracing does not unexpectedly alter CORS behavior.                                            | Carry    |
| [Query][foldkit-query]                             | Keep automatic declarations and shared caching. Reconcile desired reads through pure framework transitions, with inspectable work, staleness, deduplication, invalidation, and optimistic state.                                               | Sketch   |
| [Field Validation][foldkit-field-validation]       | Carry the Schema-backed value states and pure rules/helpers. Async validation uses Commands and correlated result Messages; a field does not need its own hidden store.                                                                        | Carry    |
| [Async Data][foldkit-async-data]                   | Preserve Idle/Loading/Refreshing/Failure/Stale/Success semantics for application-owned fields. Choose how Query projections relate to AsyncData and Effect AsyncResult, especially retained data after refresh failure.                        | Design   |
| [Machine][foldkit-machine]                         | Keep state tables, guards, analysis, and pure transitions over a Model field. Adapt returned Commands to the update result; Machine needs no separate runtime or state owner.                                                                  | Carry    |
| [Layers][foldkit-layers]                           | Preserve typed implementation selection, handler/service requirements, and Scope ownership. Separate graph acquisition from handler initialization so pure tests need not build execution services.                                            | Sketch   |
| [Managed Resources][foldkit-managed-resources]     | Keep Model-driven handle requirements, per-occurrence identities, typed access, cleanup, and lifecycle Messages. A dedicated registry is needed alongside ordinary provided Layers.                                                            | Design   |
| [Crash View][foldkit-crash-view]                   | Preserve controlled fatal-error reporting and cleanup. Decide how Application-fatal failures and UI's component fallbacks interact, including dispatch availability and complete rendered failure state.                                       | Design   |
| [Slow Warnings][foldkit-slow-warnings]             | Keep development phase budgets and attribution. Include Query reconciliation and composed updates in useful diagnostics without putting clock reads inside pure application functions.                                                         | Carry    |
| [View Memoization][foldkit-view-memoization]       | Keep component-granular rendering and pure subtree memoization. Structural sharing allows a complete Application Model to coexist with selective rendering.                                                                                    | Carry    |
| [Freeze Model][foldkit-freeze-model]               | Carry the development immutability guard across the aggregate. Freeze supported plain state without breaking Effect values or opaque host objects.                                                                                             | Carry    |
| [Preserve Scroll][foldkit-preserve-scroll]         | Preserve page-owned development-reload scroll restoration. Keep this distinct from application navigation policy and avoid changing an embedding host's window scroll.                                                                         | Carry    |
| [DevTools][foldkit-devtools]                       | Record the complete Model and app/framework facts, including cache and lifecycle changes. Preserve historical view inspection, redaction, and replay-safe Mount behavior; exact history/host integration needs design.                         | Design   |

## Decisions that the existing example does not settle

The initial Notes sketch exercises Query loading/success and a retained required
child. It does not establish full framework parity. The next prototype must
cover optional/keyed child creation and retirement, cancellation and late
results, resource reacquisition, streaming Mounts, embedded ownership, and
SSR/historical-view behavior.

AsyncData and native File expose two additional limits. The Query example uses
Effect AsyncResult; it has not established how every refreshing/stale state
should project into views. The preview's native File Schema validates a browser
object without making it portable JSON. A Schema-backed Application Model
alone does not promise that every value can cross SSR, HMR, or saved-history
boundaries. Both decisions need explicit codecs, policies, and tests.

These are preservation requirements for Foldkit's developed capabilities.
Some belong in pure libraries, others in lifecycle coordination, browser
adapters, or developer tooling. They need not all enlarge the component
authoring API or the host-neutral runtime.

## Source references

All Foldkit references below use the Blocks and Layers preview at `54f8bcd`.
The inventory comes from that revision's Core navigation, not a directory
listing or mainline Foldkit. Effect UI references use baseline `6f5c415`.

- [Core sidebar inventory](https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/docsNav.ts)
- [Existing UI Mount API](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/View.ts)
- [Existing UI Commands](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Command.ts)
- [Existing UI Subscriptions](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Subscription.ts)
- [Existing UI providers and component contracts](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/Component.ts)
- [Existing browser helpers](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/html/Html.ts)
- [Existing server renderer](https://github.com/Effect-TS/ui/blob/6f5c415d4c1bc6fc9648cd8b0ac8a67a8357bb9c/packages/ui/src/html/HtmlServer.ts)

[foldkit-architecture]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/architecture.md
[foldkit-counter-example]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/counterExample.md
[foldkit-model]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/model.md
[foldkit-messages]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/messages.md
[foldkit-update]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/update.md
[foldkit-view]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/view.md
[foldkit-commands]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/commands.md
[foldkit-subscriptions]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/subscriptions.md
[foldkit-init-flags]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/init.md
[foldkit-block]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/block.md
[foldkit-runtime]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/runtime.md
[foldkit-server-rendering]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/serverRendering.md
[foldkit-embedding]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/embedding.md
[foldkit-routing-navigation]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/routing.md
[foldkit-view-transitions]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/viewTransitions.md
[foldkit-mount]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/mount.md
[foldkit-customelement]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/customElement.md
[foldkit-dom]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/dom.md
[foldkit-render]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/render.md
[foldkit-canvas]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/canvas.md
[foldkit-file]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/file.md
[foldkit-http]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/http.md
[foldkit-query]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/query.md
[foldkit-field-validation]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/fieldValidation.md
[foldkit-async-data]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/asyncData.md
[foldkit-machine]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/machine.md
[foldkit-layers]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/layers.md
[foldkit-managed-resources]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/managedResources.md
[foldkit-crash-view]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/crashView.md
[foldkit-slow-warnings]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/slow.md
[foldkit-view-memoization]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/viewMemoization.md
[foldkit-freeze-model]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/freezeModel.md
[foldkit-preserve-scroll]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/preserveScroll.md
[foldkit-devtools]: https://github.com/foldkit/foldkit/blob/54f8bcd443b4fd18952403a3d02e212abf872d58/packages/website/src/page/core/devtools.md
