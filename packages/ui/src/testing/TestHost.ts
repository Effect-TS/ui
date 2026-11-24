/**
 * Runtime tests: mount a component tree on a plain-object host, drive it, and
 * wait for it to settle.
 *
 * `TestHost` records what it's asked to do, implements every event behaviour
 * `h` promises (only the innermost element with a handler for an event gets
 * it), and never runs `onMount` work: the test sends the message instead. Its
 * Layer swaps in a test scheduler that Commands, Subscriptions, Layer builds
 * and the render flush all go through, so `settle` can drain everything, and
 * provides `MessageLog.memory`, so `root.log()` reads back what happened.
 *
 * Runtime tests are plain scoped Effects. An app's tests drive a tree on
 * `TestHost` through `Play` and `HtmlPlay`, which act as a user does and
 * settle on their own. Use `TestHost` directly to assert on what happens
 * between settles. One instance on its own is a `Story` or a `Scene`.
 *
 * **Example** (Counting on a TestHost)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import { Component, UiSchema } from "@effect/ui"
 * import { Locator, TestHost } from "@effect/ui/testing"
 *
 * const Msg = UiSchema.TaggedEnum({ ClickedIncrement: {} })
 *
 * const Counter = Component.define({
 *   name: "Counter",
 *   scoped: false,
 *   model: Schema.Number,
 *   message: Msg
 * }).make({
 *   init: () => 0,
 *   update: ($) => $.model + 1,
 *   view: (h, count) => h.el("button").on("click", Msg.ClickedIncrement()).children(String(count))
 * })
 *
 * const program = Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Counter, {})
 *   Locator.fire(root.get(Locator.text("0")), "click")
 *   yield* TestHost.settle
 *   return root.text()
 * }).pipe(Effect.scoped, Effect.provide(TestHost.layer()))
 *
 * console.log(Effect.runSync(program)) // "1"
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Component from "../Component.ts"
import * as Feature from "../Feature.ts"
import type * as Head from "../Head.ts"
import * as controlled from "../internal/controlled.ts"
import * as Executor from "../internal/executor.ts"
import * as hostEvents from "../internal/hostEvents.ts"
import * as runtime from "../internal/runtime.ts"
import * as MessageLog from "../MessageLog.ts"
import * as Query from "../Query.ts"
import * as Renderer from "../Renderer.ts"
import * as Subscription from "../Subscription.ts"
import * as View from "../View.ts"
import * as Locator from "./Locator.ts"
import * as TestQuery from "./TestQuery.ts"

/**
 * An element on the test host.
 *
 * **Details**
 *
 * `attrs` and `props` hold what the renderer set. To act as the user editing
 * a controlled property, set `props` directly, then fire the event.
 * `handlers`, `eventOptions`, `owners` and `dispatch` are read from the
 * tree the renderer rendered last, so an element that left it has none.
 * `eventOptions` holds the options set with the handlers. The test host has
 * no default actions, so it applies none of them; a `Story` reports
 * `defaultPrevented`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TestElement extends Locator.Firable {
  readonly _tag: "Element"
  readonly tag: string
  readonly attrs: Record<string, string>
  readonly props: Record<string, unknown>
  readonly children: Array<TestNode>
  parent: TestElement | undefined
  readonly handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  readonly eventOptions: Readonly<Record<string, View.EventOptions>>
  /**
   * For each event a part of a headless component handles here, the paths
   * of the instances that get it: the deepest owner first, and the
   * component that wrote the element last. An event only that component
   * handles isn't listed.
   */
  readonly owners: Readonly<Record<string, ReadonlyArray<string>>>
  readonly dispatch: Renderer.Dispatch | undefined
}

/**
 * A text node on the test host.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TestText extends Locator.Firable {
  readonly _tag: "Text"
  readonly tag?: undefined
  text: string
  parent: TestElement | undefined
}

/**
 * Any node on the test host.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TestNode = TestElement | TestText

/** The events of each node of a path, innermost first: what a host's lookups find. */
type EventsAlong = (
  path: ReadonlyArray<TestNode>
) => ReadonlyArray<Renderer.Events | undefined>

const noLookup: EventsAlong = () => []

const controlledProps: ReadonlySet<string> = new Set([
  "value",
  "checked",
  "selected",
  "open"
])

/** `node` and its ancestors. */
const pathFrom = (node: TestNode): Array<TestNode> => {
  const path: Array<TestNode> = []
  for (let at: TestNode | undefined = node; at !== undefined; at = at.parent) {
    path.push(at)
  }
  return path
}

const fireFrom = (
  along: EventsAlong,
  node: TestNode,
  event: string,
  payload: unknown
): boolean => {
  for (const entry of along(pathFrom(node))) {
    const handler = entry?.handlers[event]
    if (entry !== undefined && handler !== undefined) {
      return entry.dispatch(event, handler, payload)
    }
  }
  throw new Error(`TestHost: nothing handles "${event}" here or above`)
}

const makeElement = (
  tag: string,
  along: EventsAlong = noLookup
): TestElement => {
  const events = () => along(pathFrom(element))[0]
  const element: TestElement = {
    _tag: "Element",
    tag,
    attrs: {},
    props: {},
    children: [],
    parent: undefined,
    get handlers() {
      return events()?.handlers ?? View.noFields
    },
    get eventOptions() {
      return events()?.options ?? View.noFields
    },
    get owners() {
      const found = events()
      return found === undefined
        ? View.noFields
        : runtime.eventOwners(found.handlers)
    },
    get dispatch() {
      return events()?.dispatch
    },
    fire: (event, payload) => fireFrom(along, element, event, payload)
  }
  return element
}

const makeText = (text: string, along: EventsAlong): TestText => {
  const node: TestText = {
    _tag: "Text",
    text,
    parent: undefined,
    fire: (event, payload) => fireFrom(along, node, event, payload)
  }
  return node
}

const describe = (node: TestNode): string =>
  node._tag === "Text" ? JSON.stringify(node.text) : `<${node.tag}>`

const detach = (node: TestNode) => {
  const parent = node.parent
  if (parent === undefined) return
  parent.children.splice(parent.children.indexOf(node), 1)
  node.parent = undefined
}

/**
 * Makes a test host. `operations` lists what the renderer asked of it, which
 * `clearOperations` empties.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHost = (): Renderer.Host<TestNode> & {
  readonly operations: () => ReadonlyArray<string>
  readonly clearOperations: () => void
  readonly commits: () => number
  /** Calls `listener` after every commit. Returns the unsubscribe. */
  readonly onCommit: (listener: () => void) => () => void
} => {
  let operations: Array<string> = []
  let commits = 0
  const listeners = new Set<() => void>()
  const { along, connect, set } = hostEvents.make<TestNode>()
  return {
    operations: () => operations,
    clearOperations: () => {
      operations = []
    },
    commits: () => commits,
    onCommit: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    createElement(tag) {
      operations.push(`create <${tag}>`)
      return makeElement(tag, along)
    },
    createText(text) {
      operations.push(`create ${JSON.stringify(text)}`)
      return makeText(text, along)
    },
    createContainer() {
      operations.push("create container")
      return makeElement("#container", along)
    },
    setText(node, text) {
      operations.push(`text ${describe(node)} -> ${JSON.stringify(text)}`)
      ;(node as TestText).text = text
    },
    setAttr(node, name, value) {
      const element = node as TestElement
      operations.push(
        `attr ${describe(node)} ${name}=${
          value === undefined ? "(removed)" : JSON.stringify(value)
        }`
      )
      if (value === undefined) delete element.attrs[name]
      else element.attrs[name] = value
    },
    setProp(node, name, value) {
      const element = node as TestElement
      if (controlledProps.has(name)) controlled.want(element, name, value)
      // A no-op is skipped, as the browser host does for controlled properties.
      if (element.props[name] === value && name in element.props) return
      operations.push(`prop ${describe(node)} ${name}`)
      if (value === undefined) delete element.props[name]
      else element.props[name] = value
    },
    insertBefore(parent, node, ref) {
      operations.push(
        `insert ${describe(node)}${
          ref === undefined ? "" : ` before ${describe(ref)}`
        }`
      )
      const into = parent as TestElement
      detach(node)
      const index = ref === undefined
        ? into.children.length
        : into.children.indexOf(ref)
      into.children.splice(index < 0 ? into.children.length : index, 0, node)
      node.parent = into
    },
    remove(node) {
      operations.push(`remove ${describe(node)}`)
      detach(node)
    },
    parentOf: (node) => node.parent,
    nextOf(node) {
      const parent = node.parent
      return parent === undefined
        ? undefined
        : parent.children[parent.children.indexOf(node) + 1]
    },
    setEvents(node, handlers, dispatch, options) {
      set(node, { handlers, dispatch, options })
    },
    events: { connect, listen() {} },
    elements: "any",
    controlled: controlledProps,
    runsMounts: false,
    commit: () => {
      commits++
      for (const listener of Array.from(listeners)) listener()
    },
    head: () => {
      operations.push("head")
    }
  }
}

/**
 * The `TestHost` service: the host, the test scheduler and the log.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestHost {
  readonly host: ReturnType<typeof makeHost>
  readonly log: MessageLog.Memory
  /** Drains the test scheduler once. Returns whether it finished within the budget. */
  readonly drain: (budget: number) => boolean
  /** Whether the test scheduler has work queued. */
  readonly busy: () => boolean
  /** The Command runs and fetches still in flight in every tree mounted on this host. */
  readonly pending: () => ReadonlyArray<Pending>
  readonly budget: number
  /** Adds a mounted tree to `pending` and `settle`, until the returned function is called. */
  readonly register: (tree: Tree) => () => void
  /** The settable `Query.Visibility` every mount gets. */
  readonly visibility: Query.Signal & { readonly set: (value: boolean) => void }
  /** The settable `Query.Connectivity` every mount gets. */
  readonly connectivity: Query.Signal & {
    readonly set: (value: boolean) => void
  }
  /** The problems reported and not yet taken. */
  readonly problems: () => ReadonlyArray<Query.Problem.Any>
  /** Collects a problem. Every mount's cache reports here. */
  readonly report: (problem: Query.Problem.Any) => void
  /** Takes every problem with this tag. Throws when there is none. */
  readonly expectProblem: (tag: string) => ReadonlyArray<Query.Problem.Any>
  /** Wraps a `Clock` so that a woken sleeper drains the test scheduler. */
  readonly drainingClock: (
    clock: Clock.Clock,
    context: Context.Context<never>
  ) => Clock.Clock
  /** The trees mounted on this host. */
  readonly trees: () => ReadonlySet<Tree>
}

/**
 * A tree registered with `TestHost`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Tree {
  readonly pending: () => ReadonlyArray<Pending>
  /** The root's failure, once it crashed. */
  readonly crashed: () => Cause.Cause<unknown> | undefined
  readonly path: string
}

/**
 * Work still in flight: a Command run, a fetch or a lazy component's load.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Pending = PendingCommand | PendingFetch | PendingLoad

/**
 * A Command run still in flight: the instance that issued it, its name, and
 * whether it's `running`, `queued`, `awaiting` (its fiber exited and its
 * message waits, on a `Command.afterRefetch` wait or, under `queue`, behind
 * an earlier message of its group) or `stopping` (it was interrupted and its
 * fiber, cleanup included, hasn't exited).
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PendingCommand {
  readonly _tag: "Command"
  readonly path: string
  readonly name: string
  readonly status: string
}

/**
 * A fetch the cache holds: `running`, or `held` until a live patch's run
 * exits, with the trigger it started or will start with.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PendingFetch {
  readonly _tag: "Fetch"
  /** The root's path. */
  readonly path: string
  readonly query: string
  readonly logKey: string
  readonly status: "running" | "held"
  readonly trigger: Query.Trigger
}

/**
 * A `Component.lazy` module a slot waits for: the slot's path and the name
 * given to `lazy`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PendingLoad {
  readonly _tag: "Load"
  readonly path: string
  readonly name: string
}

/**
 * A drain woken by the clock ran out of budget. What was queued stays queued,
 * and the next `settle` runs it and fails on this problem.
 *
 * @stability experimental
 * @category problems
 * @since 0.1.0
 */
export class DrainExhausted extends Data.TaggedClass("DrainExhausted")<{
  readonly message: string
}> {}

/**
 * The `TestHost` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestHost: Context.Service<TestHost, TestHost> = Context.Service<
  TestHost
>("@effect/ui/testing/TestHost")

/**
 * When a tree's render flush runs among the tasks the test scheduler holds:
 * the steps of Command, Subscription, mount and Layer fibers.
 *
 * **Details**
 *
 * - `"queued"`: in its turn, after the tasks queued before it. The default.
 * - `"first"`: before every task already queued.
 * - `"last"`: once no task is queued, the ones queued meanwhile included.
 * - `{ seed }`: at a place a generator seeded with `seed` picks, so a run
 *   that fails is repeated by its seed.
 *
 * A browser renders on its own clock, between whatever work arrives. A test
 * that passes under one of these and fails under another has found
 * behaviour that depends on when the render ran.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Flush = "queued" | "first" | "last" | { readonly seed: number }

const flushFrom = (value: string): Flush | undefined => {
  if (value === "queued" || value === "first" || value === "last") return value
  const seed = Number(value)
  return value !== "" && Number.isInteger(seed) ? { seed } : undefined
}

/**
 * Provides `TestHost`, the `Renderer` for it, the test scheduler and a
 * `MessageLog.memory` log.
 *
 * **Details**
 *
 * `budget` is how many scheduler tasks `settle` and a clock wake run before
 * they give up (100,000 by default), and `logSize` the size of the log's ring
 * buffer, unbounded by default.
 *
 * `flush` is when a render flush runs among the scheduler's tasks: see
 * `Flush`. Without it, the config `EFFECT_UI_TEST_FLUSH` decides, which the
 * default `ConfigProvider` reads from the environment: `queued`, `first`,
 * `last`, or an integer for a seed. That runs a whole suite under another
 * policy without a change to its tests. Without either it's `"queued"`.
 *
 * The Layer owns settable `Query.Visibility` and `Query.Connectivity`, both
 * starting true, and collects the problems every mounted cache reports.
 *
 * **Gotchas**
 *
 * A problem fails the test: `settle` fails with a `ProblemsError`, and the
 * Layer's Scope closes with one as a defect, unless `expectProblem` took it.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: {
  readonly budget?: number | undefined
  readonly logSize?: number | undefined
  readonly flush?: Flush | undefined
}): Layer.Layer<TestHost | Renderer.Renderer> =>
  Layer.effectContext(Effect.gen(function*() {
    const host = makeHost()
    // No config, or a provider that fails to read, is no setting.
    const flush = options?.flush ??
      flushFrom(
        yield* Effect.orElseSucceed(
          Config.String("EFFECT_UI_TEST_FLUSH"),
          () => ""
        )
      ) ??
      "queued"
    const executor = new Executor.TestExecutor(flush)
    const log = MessageLog.makeMemory({ size: options?.logSize ?? Infinity })
    const trees = new Set<Tree>()
    const budget = options?.budget ?? 100_000
    let problems: Array<Query.Problem.Any> = []
    let draining = false
    // Re-entrant calls return at once: the outer drain runs what they would.
    const drain = (n: number): boolean => {
      if (draining) return true
      draining = true
      try {
        return executor.drain(n)
      } finally {
        draining = false
      }
    }
    const report = (problem: Query.Problem.Any) => {
      problems.push(problem)
    }
    const drainingClock = (
      clock: Clock.Clock,
      context: Context.Context<never>
    ): Clock.Clock => {
      const run = Effect.runForkWith(context)
      const sleep = (duration: Duration.Duration): Effect.Effect<void> =>
        Effect.callback<void>((resume) => {
          const fiber = run(clock.sleep(duration))
          let done = false
          fiber.addObserver(() => {
            // Cancelled: the sleeper is gone, and nothing woke.
            if (done) return
            done = true
            resume(Effect.void)
            if (!drain(budget)) {
              report(
                new DrainExhausted({
                  message:
                    `[TestHost] a clock wake ran ${budget} tasks and work is still being scheduled.`
                })
              )
            }
          })
          return Effect.sync(() => {
            if (done) return
            done = true
            fiber.interruptUnsafe()
          })
        })
      return Object.assign(Object.create(clock), { sleep }) as Clock.Clock
    }
    const service: TestHost = {
      host,
      log,
      drain,
      busy: () => executor.size > 0,
      pending: () => [...trees].flatMap((tree) => tree.pending()),
      budget,
      register: (tree) => {
        trees.add(tree)
        return () => {
          trees.delete(tree)
        }
      },
      visibility: Query.makeSignal(true),
      connectivity: Query.makeSignal(true),
      problems: () => problems.slice(),
      report,
      expectProblem: (tag) => {
        const matched = problems.filter((problem) => problem._tag === tag)
        if (matched.length === 0) {
          throw new Error(
            "[TestHost] expected a " + tag +
              " problem, and the cache reported " +
              (problems.length === 0
                ? "none"
                : problems.map((problem) => problem._tag).join(", "))
          )
        }
        problems = problems.filter((problem) => problem._tag !== tag)
        return matched
      },
      drainingClock,
      trees: () => trees
    }
    yield* Effect.addFinalizer(() =>
      Effect.suspend(() =>
        problems.length === 0
          ? Effect.void
          : Effect.die(new TestQuery.ProblemsError({ problems }))
      )
    )
    return Context.make(TestHost, service).pipe(
      Context.add(Renderer.Renderer, { host }),
      Context.add(Executor.CurrentExecutor, executor),
      Context.add(MessageLog.MessageLog, log)
    ) as Context.Context<TestHost | Renderer.Renderer>
  }))

/**
 * A tree mounted on `TestHost`'s scheduler, whatever host renders it: what
 * a test reads and drives without looking at nodes.
 *
 * **Details**
 *
 * `mount` hands back a `TestRoot`, which adds the test host's node lookups.
 * `Ssr.ssr` hands back this part only, since its client renders into a real
 * document.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Root<out Model, in Msg, out Events> {
  /** The root instance's path, `/<name>`. */
  readonly path: string
  readonly session: string
  /** The root's current Model, or `undefined` after it crashed. */
  readonly model: () => Model | undefined
  /** Sends a message to the root. The log shows it as a `Dispatch`. */
  readonly send: (message: Msg) => void
  /** What the root emitted, in order. */
  readonly emitted: ReadonlyArray<Events>
  /** This mount's log entries, oldest first. */
  readonly log: () => ReadonlyArray<MessageLog.Entry>
  /** The Command runs, fetches and lazy loads still in flight in this tree. */
  readonly pending: () => ReadonlyArray<Pending>
  /** Every fetch the tree's cache started, oldest first: the log's `FetchStarted` entries. */
  readonly fetches: () => ReadonlyArray<MessageLog.FetchStarted>
  /**
   * A query-only view of the cache's entry for a query and arguments, or
   * `undefined` when it has none. It doesn't create the entry or keep it alive.
   */
  readonly entry: <R extends Query.Query.Any>(
    read: R,
    args: Query.Query.Args<R>
  ) => TestQuery.Entry<Query.Query.Success<R>, Query.Query.Error<R>> | undefined
  /**
   * The head the tree's last fold computed, in the root vocabulary's form,
   * whether or not the host applies it. Name the form to read it, such as
   * `root.head<HtmlHead.HtmlHead>()` for an `Html` root.
   */
  readonly head: <H = Head.Head>() => H
  /** The `frames` projection after each commit, without consecutive repeats. */
  readonly frames: () => ReadonlyArray<string>
}

/**
 * A tree mounted on `TestHost`, with lookups over its nodes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TestRoot<out Model, in Msg, out Events>
  extends Root<Model, Msg, Events>
{
  /** The element the tree is mounted in. */
  readonly container: TestElement
  /** The text of everything mounted. */
  readonly text: () => string
  readonly all: (locator: Locator.Locator) => ReadonlyArray<TestNode>
  readonly query: (locator: Locator.Locator) => TestNode | undefined
  readonly get: (locator: Locator.Locator) => TestNode
}

/**
 * Mounts a component tree on the test host, for the life of the current
 * Scope.
 *
 * **Details**
 *
 * The first render happens at once. Commands, Subscriptions, fetches and
 * Layer builds wait for `settle`. The test host shows every vocabulary, so
 * any root mounts.
 *
 * The mount uses the host's `Query.Visibility`, `Query.Connectivity` and
 * problem collector even if a nearer provide overrides them. Its `Clock`
 * drains the test scheduler whenever a sleeper wakes, so `TestClock.adjust`
 * runs the awakened work without waiting for `settle`.
 * `frames` projects the tree after each commit for `root.frames()`, and
 * defaults to `root.text()`.
 *
 * `props` may be an Effect, such as `Router.props(AppRoute)` under
 * `Router.memory`, run once before `init`, as with `Renderer.mount`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: {
    readonly fallback?:
      | ((
        failure: AsyncResult.Failure<never, unknown>,
        h: View.Helper<never, {}> & View.Tags<V, never>
      ) => View.Content<never, RF>)
      | undefined
    readonly query?: Renderer.QueryOptions | undefined
    readonly frames?:
      | ((root: TestRoot<Model, Msg, Events>) => string)
      | undefined
  }
): Effect.Effect<
  TestRoot<Model, Msg, Events>,
  never,
  R | RF | RP | TestHost | Scope.Scope
> =>
  Effect.gen(function*() {
    const testHost = yield* TestHost
    const container = makeElement("#root")
    const outer = yield* Effect.context<never>()
    const project = options?.frames ??
      ((root: TestRoot<Model, Msg, Events>) => root.text())
    const frames: Array<string> = []
    let testRoot: TestRoot<Model, Msg, Events> | undefined
    const frame = () => {
      if (testRoot === undefined) return
      const next = project(testRoot)
      if (frames.length === 0 || frames[frames.length - 1] !== next) {
        frames.push(next)
      }
    }
    const offCommit = testHost.host.onCommit(frame)
    yield* Effect.addFinalizer(() => Effect.sync(offCommit))
    const root = yield* runtime.mount(
      component as any,
      props,
      container,
      options as any
    ).pipe(
      Effect.provideService(
        Clock.Clock,
        testHost.drainingClock(Context.get(outer, Clock.Clock), outer)
      ),
      Effect.provideService(Query.Visibility, testHost.visibility),
      Effect.provideService(Query.Connectivity, testHost.connectivity),
      Effect.provideService(Query.Problems, testHost.report)
    )
    const neutral = yield* register(
      testHost,
      root,
      testHost.log,
      () => frames.slice()
    )
    testRoot = {
      ...neutral,
      container,
      text: () => Locator.textOf(container),
      all: (locator) => Locator.all(container as TestNode, locator),
      query: (locator) => Locator.query(container as TestNode, locator),
      get: (locator) => Locator.get(container as TestNode, locator)
    }
    frame()
    return testRoot
  }) as any

/**
 * Registers a mounted tree with `TestHost`, so `settle` waits for it and
 * fails when it crashes, and builds its host-neutral view over `log` and
 * the frames its host recorded.
 *
 * @internal
 */
export const register = (
  testHost: TestHost,
  root: runtime.Root & Renderer.Root<any, any>,
  log: MessageLog.Memory,
  frames: () => ReadonlyArray<string>
): Effect.Effect<Root<any, any, any>, never, Scope.Scope> =>
  Effect.gen(function*() {
    const pending = (): ReadonlyArray<Pending> => [
      ...root.pending().map((run): Pending => ({ _tag: "Command", ...run })),
      ...root.cache.pending().map((fetch): Pending => ({
        _tag: "Fetch",
        path: root.path,
        ...fetch
      })),
      ...root.loads().map((load): Pending => ({ _tag: "Load", ...load }))
    ]
    const unregister = testHost.register({
      path: root.path,
      pending,
      crashed: root.crashed
    })
    yield* Effect.addFinalizer(() => Effect.sync(unregister))
    const entries = () =>
      log.entries().filter((entry) => entry.session === root.session)
    return {
      path: root.path,
      session: root.session,
      model: root.model,
      send: root.send,
      emitted: root.emitted,
      log: entries,
      pending,
      fetches: () =>
        entries().filter((entry): entry is MessageLog.FetchStarted =>
          entry._tag === "FetchStarted"
        ),
      entry: (read, args) => root.cache.inspect(Query.defOf(read), args) as any,
      head: root.head as <H>() => H,
      frames
    }
  })

/**
 * A root mounted on the host crashed. `settle` fails with it.
 *
 * @stability experimental
 * @category errors
 * @since 0.1.0
 */
export class RootCrashed extends Data.TaggedError("RootCrashed")<{
  readonly path: string
  readonly cause: Cause.Cause<unknown>
}> {
  override get message(): string {
    return `The root ${this.path} crashed:\n${Cause.pretty(this.cause)}`
  }
}

/**
 * `settle` ran out of budget: something keeps scheduling work.
 *
 * @stability experimental
 * @category errors
 * @since 0.1.0
 */
export class SettleError extends Data.TaggedError("SettleError")<{
  readonly message: string
  readonly pending: ReadonlyArray<Pending>
  readonly log: ReadonlyArray<MessageLog.Entry>
}> {}

const nextMacrotask = Effect.callback<void>((resume) => {
  const handle = setTimeout(() => resume(Effect.void), 0)
  return Effect.sync(() => clearTimeout(handle))
})

/**
 * Runs everything the test scheduler holds, and what that schedules, until
 * nothing is left.
 *
 * **Details**
 *
 * A fiber blocked on a Queue or on `TestClock` counts as idle, so a
 * Subscription waiting for its next value, or a Command or fetch sleeping on
 * the clock, doesn't keep `settle` from returning; adjust `TestClock`, which
 * runs what it wakes. Work that resolves a Promise gets a few macrotasks to
 * come back. A run or fetch that never returns is left in `pending()`. A
 * `Component.lazy` load is waited for until it settles.
 *
 * **Gotchas**
 *
 * When the budget runs out, `settle` fails with a `SettleError` holding the
 * log's tail and what is pending. A crashed root fails it with `RootCrashed`,
 * and a problem nothing took with `expectProblem` with a `ProblemsError`.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const settle: Effect.Effect<
  void,
  SettleError | RootCrashed | TestQuery.ProblemsError,
  TestHost
> = Effect
  .gen(function*() {
    const testHost = yield* TestHost
    yield* drainAll(testHost)
    for (const tree of testHost.trees()) {
      const cause = tree.crashed()
      if (cause !== undefined) {
        return yield* new RootCrashed({ path: tree.path, cause })
      }
    }
    const problems = testHost.problems()
    if (problems.length > 0) {
      return yield* new TestQuery.ProblemsError({ problems })
    }
  })

const drainAll = Effect.fnUntraced(function*(testHost: TestHost) {
  let budget = testHost.budget
  let quiet = 0
  while (quiet < 3) {
    if (testHost.busy()) {
      quiet = 0
      const before = budget
      if (!testHost.drain(budget)) {
        const log = testHost.log.entries().slice(-20)
        const pending = testHost.pending()
        return yield* new SettleError({
          message: [
            `TestHost.settle ran ${testHost.budget} tasks and work is still being scheduled.`,
            "Last log entries:",
            formatLog(log),
            "Pending:",
            pending.length === 0
              ? "  (none)"
              : pending.map(describePending).join("\n")
          ].join("\n"),
          pending,
          log
        })
      }
      budget = Math.max(0, before - 1)
      continue
    }
    // A run or fetch sleeping on the clock looks the same as one waiting on a Promise, so anything
    // in flight gets the grace.
    const pending = testHost.pending()
    if (pending.length === 0) return
    // Something may come back from outside the scheduler, such as a resolved Promise.
    if (!pending.some((pending) => pending._tag === "Load")) quiet++
    yield* nextMacrotask
  }
})

const describePending = (pending: Pending): string =>
  pending._tag === "Command"
    ? `  ${pending.path} ${pending.name} (${pending.status})`
    : pending._tag === "Load"
    ? `  ${pending.path} load ${pending.name}`
    : `  ${pending.path} fetch ${pending.query} ${pending.logKey} (${pending.status}, ${pending.trigger})`

/**
 * Sets the host's `Query.Visibility`, which every mount on it reads. It
 * starts true. Going from false to true, while online, refetches every
 * watched entry that is stale or whose interval elapsed.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const setVisible = (
  visible: boolean
): Effect.Effect<void, never, TestHost> =>
  TestHost.useSync((testHost) => testHost.visibility.set(visible))

/**
 * Sets the host's `Query.Connectivity`, which every mount on it reads. It
 * starts true. Going from false to true, while visible, refetches every
 * watched entry that is stale or whose interval elapsed.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const setOnline = (
  online: boolean
): Effect.Effect<void, never, TestHost> =>
  TestHost.useSync((testHost) => testHost.connectivity.set(online))

/**
 * Returns the problems reported on this host that no `expectProblem` took.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const problems: Effect.Effect<
  ReadonlyArray<Query.Problem.Any>,
  never,
  TestHost
> = TestHost.useSync(
  (testHost) => testHost.problems()
)

/**
 * Takes every reported problem with the given tag, so it no longer fails
 * `settle` or the test, and returns them.
 *
 * **Gotchas**
 *
 * Dies when no problem with that tag was reported.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const expectProblem = <Tag extends string>(tag: Tag): Effect.Effect<
  ReadonlyArray<
    [Extract<Query.Problem | DrainExhausted, { readonly _tag: Tag }>] extends
      [never] ? Query.Problem.Any
      : Extract<Query.Problem | DrainExhausted, { readonly _tag: Tag }>
  >,
  never,
  TestHost
> => TestHost.useSync((testHost) => testHost.expectProblem(tag) as any)

const summary = (value: unknown): string => {
  if (typeof value === "object" && value !== null && "_tag" in value) {
    return String((value as any)._tag)
  }
  try {
    const json = JSON.stringify(MessageLog.structural(value))
    return json.length > 60 ? json.slice(0, 57) + "..." : json
  } catch {
    return String(value)
  }
}

/**
 * Formats log entries one per line, for test failures.
 *
 * @stability experimental
 * @category formatting
 * @since 0.1.0
 */
export const formatLog = (entries: ReadonlyArray<MessageLog.Entry>): string =>
  entries.map((entry) => "  " + formatEntry(entry)).join("\n")

/**
 * Formats log entries as a timeline: each fact on its own line, in the order
 * they happened, with the entries that follow from it indented under it.
 *
 * **Details**
 *
 * A fact is an entry without `causedBy`: a message from a DOM event, a
 * Command's result, a Subscription or `root.send`, a query result, a Layer
 * build or a run ending. The entries under it are what the tree did about
 * it, in the order they were logged: the messages its `update` sent on, the
 * props, mounts and unmounts of its render, the runs it stopped and the
 * fetches its render started. See `MessageLog.Base`.
 *
 * An entry is listed under its fact even when the flush that logged it ran
 * after later facts, so its number can be higher than the next fact's. An
 * entry whose fact isn't among `entries`, as when a ring buffer dropped it,
 * is listed as a fact, with `(after #n)` naming the missing one.
 *
 * **Example** (Printing what a click did)
 *
 * ```ts
 * import { TestHost } from "@effect/ui/testing"
 *
 * declare const root: TestHost.TestRoot<unknown, unknown, unknown>
 *
 * console.log(TestHost.formatTimeline(root.log()))
 * // #7 /Parent Update Inc (dispatch)
 * //     #8 /Parent/Child[child] PropsChanged
 * // #9 /Parent/Child[child] Update Read (dom click)
 * ```
 *
 * @stability experimental
 * @category formatting
 * @since 0.1.0
 */
export const formatTimeline = (
  entries: ReadonlyArray<MessageLog.Entry>
): string => {
  const facts = new Map<number, Array<MessageLog.Entry>>()
  for (const entry of entries) {
    if (entry.causedBy === undefined || !facts.has(entry.causedBy)) {
      facts.set(entry.seq, [])
    } else facts.get(entry.causedBy)!.push(entry)
  }
  const lines: Array<string> = []
  for (const entry of entries) {
    const followed = facts.get(entry.seq)
    if (followed === undefined) continue
    lines.push(
      formatEntry(entry) +
        (entry.causedBy === undefined ? "" : ` (after #${entry.causedBy})`)
    )
    for (const consequence of followed) {
      lines.push("    " + formatEntry(consequence))
    }
  }
  return lines.join("\n")
}

const formatEntry = (entry: MessageLog.Entry): string => {
  const head = `#${entry.seq}${
    "path" in entry ? ` ${entry.path}` : ""
  } ${entry._tag}`
  switch (entry._tag) {
    case "Update": {
      const source = entry.source
      const from = source._tag === "DomEvent"
        ? `dom ${source.name}`
        : source._tag === "Command"
        ? `command ${source.name}`
        : source._tag === "Subscription"
        ? `subscription ${source.key}`
        : source._tag === "Query"
        ? `query ${source.name}`
        : source._tag === "Emit"
        ? `emit from ${source.path}`
        : source._tag === "Failure"
        ? `failure of ${source.path}`
        : source._tag === "Send"
        ? `send from ${source.path}`
        : source._tag === "Shared"
        ? `shared ${source.name} from ${source.path}`
        : source._tag === "Collected"
        ? "collected"
        : source._tag === "Mount"
        ? `mount ${source.name}`
        : "dispatch"
      const commands = entry.commands.length === 0
        ? ""
        : ` -> ${entry.commands.map((c) => c.name).join(", ")}`
      const events = entry.events.length === 0
        ? ""
        : ` events ${entry.events.map(summary).join(", ")}`
      const sends = entry.sends.length === 0
        ? ""
        : ` sends ${
          entry.sends.map((send) =>
            `${send.owner.definition.name} ${summary(send.message)}`
          ).join(", ")
        }`
      return `${head} ${
        summary(entry.message)
      } (${from})${commands}${events}${sends}`
    }
    case "Mounted":
      return `${head}${
        entry.commands.length === 0
          ? ""
          : ` -> ${entry.commands.map((c) => c.name).join(", ")}`
      }`
    case "Failed":
      return `${head} in ${entry.in}${
        entry.name === undefined ? "" : ` (${entry.name})`
      }${
        entry.update === undefined ? "" : ` of ${summary(entry.update.message)}`
      }: ${entry.cause.toString().split("\n")[0]}`
    case "SubscriptionStarted":
    case "SubscriptionStopped":
      return `${head} ${entry.key}`
    case "CommandEnded":
      return `${head} ${entry.name}${entry.silent ? " (silent)" : ""}${
        entry.waitEnded === undefined ? "" : ` (wait ${entry.waitEnded})`
      }`
    case "MountEnded":
      return `${head} ${entry.name} (${entry.reason})${
        entry.silent ? " (silent)" : ""
      }`
    case "MountStarted":
    case "CommandStarted":
      return `${head} ${entry.name}`
    case "CommandInterrupted":
      return `${head} ${entry.name} (${entry.reason})`
    case "CommandAwaiting":
      return `${head} ${entry.name} on ${
        entry.entries.map((awaited) => `${awaited.query} ${awaited.logKey}`)
          .join(", ")
      }`
    case "CommandDropped":
      return `${head} ${entry.name} (${entry.reason})`
    case "SendDropped":
      return `${head} ${entry.owner}`
    case "FetchStarted":
      return `${head} ${entry.query} ${entry.logKey} (${entry.trigger}${
        entry.restart ? ", restart" : ""
      })`
    default:
      return head
  }
}

/**
 * A stand-in for a feature, from `stub`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Stub<Self, Props, Events> {
  /** Provides the stub as the feature's implementation. */
  readonly layer: Layer.Layer<Self>
  /** The props the stub rendered with, in order, without repeats. */
  readonly props: () => ReadonlyArray<Props>
  /** Makes every mounted stub emit, as the real feature would. Settle first, so it's listening. */
  readonly emit: (events: Events) => void
}

/**
 * Stands in for a feature in a `Play` or a runtime test: it renders a `<stub>` element
 * with a `data-stub` attribute naming the feature, records the props it gets,
 * and emits what the test sends.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const stub = <Self, Props, Events>(
  feature: Feature.Service<Self, Props, Events>
): Stub<Self, Props, Events> => {
  const name: string = feature[Feature.TypeId].name
  const seen: Array<Props> = []
  const listeners = new Set<(events: Events) => void>()
  const Emit = Schema.TaggedStruct("~@effect/ui/TestHost/Emit", {
    events: feature.events
  })
  const component = Component.define({
    name,
    scoped: false,
    props: feature.props,
    model: Schema.Number,
    message: Emit,
    events: feature.events
  }).make({
    init: () => 0,
    update: ($, message) => $.set($.model + 1).emit(message.events),
    view: (h) => {
      if (seen.length === 0 || seen[seen.length - 1] !== h.props) {
        seen.push(h.props)
      }
      return h.el("stub").attr("data-stub", name)
    },
    subscriptions: () => [
      Subscription.make(
        "stub",
        Stream.callback<typeof Emit.Type>((queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const listener = (events: Events) => {
                Queue.offerUnsafe(queue, Emit.make({ events }))
              }
              listeners.add(listener)
              return listener
            }),
            (listener) => Effect.sync(() => listeners.delete(listener))
          )
        )
      )
    ]
  })
  return {
    layer: feature.toLayer(component as any),
    props: () => seen,
    emit: (events) => {
      for (const listener of listeners) listener(events)
    }
  }
}
