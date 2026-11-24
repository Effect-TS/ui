/**
 * The cursor every kind of test extends: the shared steps over the engine's
 * record, with the acknowledgement rule checked around each one.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { pipeArguments } from "effect/Pipeable"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import type * as Steps from "../testing/Steps.ts"
import { isWatchKey } from "./queries.ts"
import * as engine from "./story.ts"

/**
 * The engine record behind each record a cursor hands out, so a module
 * export such as `Story.head` can read what the record doesn't show.
 *
 * @internal
 */
export const stateOf = new WeakMap<object, engine.State<any, any, any, any>>()

/** How a step counts for the rule: delivers a message, acts some other way, or only asserts. */
type Kind = "message" | "acting"

/** @internal */
export abstract class Cursor {
  state: engine.State<any, any, any, any>
  readonly module: string
  private projected: object | undefined
  constructor(module: string, state: engine.State<any, any, any, any>) {
    this.module = module
    this.state = state
  }
  /** The record this kind hands out for `state`. */
  protected abstract project(state: engine.State<any, any, any, any>): object
  /**
   * Runs once a step has settled, so a kind that renders fails the step on a defect in `view`, and
   * records what it follows in the view.
   */
  protected settled(
    state: engine.State<any, any, any, any>,
    _step: string
  ): engine.State<any, any, any, any> {
    return state
  }

  get current(): any {
    if (this.projected === undefined) {
      this.projected = this.project(this.state)
      stateOf.set(this.projected, this.state)
    }
    return this.projected
  }
  get pending(): ReadonlyArray<unknown> {
    return this.state.pending
  }
  get interrupted(): ReadonlyArray<unknown> {
    return this.state.interrupted
  }
  get loadingMore(): ReadonlyArray<string> {
    return this.state.loadingMore
  }
  get subscriptions(): ReadonlyArray<string> {
    return this.state.subscriptions()
  }
  get queryInfo(): ReadonlyArray<Steps.QueryInfo> {
    return this.state.queryInfo()
  }
  pipe() {
    return pipeArguments(this, arguments)
  }
  protected name(step: string): string {
    return `${this.module}.${step}`
  }
  /** Replaces the record without the rule's checks: an assertion step that changed what is acknowledged. */
  protected replace(state: engine.State<any, any, any, any>): this {
    this.state = state
    this.projected = undefined
    return this
  }
  /**
   * Runs an acting step: the checks before it, then `f`, then the keyed prunes and the bookkeeping
   * after it. `f` does the step's lookups too, so the rule's failure comes before theirs. `after` is
   * read once `f` ran: how an interaction went, for a step that is one.
   */
  protected act(
    step: string,
    kind: Kind,
    f: (
      state: engine.State<any, any, any, any>
    ) => engine.State<any, any, any, any>,
    after: () => {
      readonly interaction?: "handled" | "ignored" | undefined
      readonly defaultPrevented?: boolean
    } = () => ({})
  ): this {
    engine.checkBefore(this.state, this.name(step), kind)
    const next = f(this.state)
    const { defaultPrevented = false, interaction } = after()
    const pruned = next === this.state
      ? next
      : engine.pruneKeyed(next, this.module)
    const ack = pruned.ack
    // Read only when a mark could end: reading the queries runs each one's args.
    const missing = ack.keptQueries.length === 0 ? [] : engine.unloaded(pruned)
    const settled = engine.update(pruned, {
      defaultPrevented,
      ack: {
        ...ack,
        // A query's mark ends once its entry holds a result or its args moved on.
        keptQueries: ack.keptQueries.filter((kept) =>
          missing.some((entry) =>
            entry.name === kept.name && entry.argsKey === kept.argsKey
          )
        ),
        kept: ack.kept.filter((entry) => pruned.pending.includes(entry)),
        interaction,
        ignored: interaction === "ignored",
        acted: true
      }
    })
    return this.replace(this.settled(settled, this.name(step)))
  }
  /** The end of `make`: the end check, after the kind's own render. */
  finish(): void {
    engine.checkEnd(
      this.settled(this.state, this.name("make")),
      this.name("make")
    )
  }

  given(
    model: unknown,
    queries?: { readonly [name: string]: unknown },
    shared: ReadonlyArray<readonly [Component.Headless.Any, unknown]> = []
  ): this {
    const step = this.name("given")
    if (this.state.ack.acted) engine.checkGiven(this.state, step)
    const next = typeof model === "function" ? model(this.state.model) : model
    const out = engine.update(this.state, {
      model: next,
      pending: [],
      emitted: [],
      sent: [],
      interrupted: [],
      loadingMore: [],
      ack: { ...engine.noAck, acted: true },
      shared: engine.withShared(this.state, shared, step)
    })
    // Settled here, with no onChange message: the step's own prune then has nothing to write.
    const state = engine.pruneKeyed(
      engine.update(out, {
        results: engine.givenResults(out, queries ?? {}, step)
      }),
      this.module
    )
    if (this.state.ack.acted) engine.checkGivenQueries(this.state, state, step)
    return this.replace(this.settled(state, step))
  }
  shared(owner: Component.Headless.Any, value: unknown): this {
    const step = this.name("shared")
    const given = (state: engine.State<any, any, any, any>) =>
      engine.update(state, {
        shared: engine.withShared(state, [[owner, value]], step)
      })
    const messages = engine.sharedMessages(this.state, owner, value)
    // Only what readers see changes: nothing to settle or check.
    if (messages.length === 0) {
      return this.replace(this.givenShared(given(this.state), step))
    }
    return this.act(
      "shared",
      "message",
      (state) =>
        messages.reduce<engine.State<any, any, any, any>>(
          (out, message) => engine.dispatch(out, message),
          given(state)
        )
    )
  }
  /** A `shared` step that sent nothing: a kind that renders renders the new value, when it can. */
  protected givenShared(
    state: engine.State<any, any, any, any>,
    _step: string
  ): engine.State<any, any, any, any> {
    return state
  }
  props(next: unknown): this {
    return this.act(
      "props",
      "acting",
      (state) =>
        engine.update(state, {
          props: typeof next === "function" ? next(state.props) : next
        })
    )
  }
  subscription(key: string, message: unknown): this {
    const keys = this.state.subscriptions()
    if (isWatchKey(key) || !keys.includes(key)) {
      const reason = isWatchKey(key) ? "is a query watch" : "is inactive"
      throw new Error(
        `${this.name("subscription")}: ${
          JSON.stringify(key)
        } ${reason}; active keys: ${JSON.stringify(keys)}`
      )
    }
    return this.act(
      "subscription",
      "message",
      (state) => engine.dispatch(state, message)
    )
  }
  layerFailed(failure: AsyncResult.Failure<never, any>): this {
    return this.act(
      "layerFailed",
      "message",
      (state) => engine.dispatch(state, state.component.layerFailure?.(failure))
    )
  }

  resolve(target: Steps.Target, result: unknown): this {
    const entry = engine.findRunning(this.state, target, this.name("resolve"))
    return this.act(
      "resolve",
      "acting",
      (state) =>
        engine.exited(state, entry, {
          message: engine.resolveWith(entry, result),
          awaiting: engine.awaitedLoaders(state, entry.command, result)
        })
    )
  }
  fail(target: Steps.Target, error: unknown): this {
    const entry = engine.findRunning(this.state, target, this.name("fail"))
    const reject = entry.command.reject as
      | ((error: unknown) => unknown)
      | undefined
    if (reject === undefined) {
      throw new Error(
        `${this.name("fail")}: ${
          engine.describe(entry.command)
        } has no typed failure mapped by Command.match`
      )
    }
    return this.act(
      "fail",
      "acting",
      (state) =>
        engine.exited(state, entry, { message: reject(error), awaiting: [] })
    )
  }
  next(target: Steps.StreamTarget, result: unknown): this {
    const entry = engine.findStream(this.state, target, this.name("next"))
    return this.act(
      "next",
      "acting",
      (state) => engine.dispatch(state, engine.resolveWith(entry, result))
    )
  }
  end(target: Steps.StreamTarget): this {
    const entry = engine.findStream(this.state, target, this.name("end"))
    return this.act(
      "end",
      "acting",
      (state) => engine.exited(state, entry, undefined)
    )
  }
  waitExpired(target: Steps.Target): this {
    const entry = this.state.pending.find((entry) =>
      entry.awaiting !== undefined && entry.awaiting.length > 0 &&
      engine.matches(target, entry)
    )
    if (entry === undefined) {
      throw new Error(
        `${this.name("waitExpired")}: no ${
          engine.describeTarget(target)
        } is waiting on refetches; pending: ${
          engine.describePending(this.state.pending)
        }`
      )
    }
    return this.act(
      "waitExpired",
      "acting",
      (state) =>
        engine.settleWaits(
          state,
          (awaited) => entry.awaiting!.includes(awaited)
        )
    )
  }
  loaded(name: string, ...rest: Array<any>): this {
    const step = this.name("loaded")
    if (engine.isKeyed(this.state, name)) {
      const [args, value, options] = rest
      return this.act(
        "loaded",
        "acting",
        (state) =>
          engine.loadKeyedStep(state, step, name, [{ args, value, ...options }])
      )
    }
    const [value, options] = rest as [
      unknown,
      {
        readonly waiting?: boolean | undefined
        readonly patched?: boolean | undefined
      } | undefined
    ]
    return this.act("loaded", "acting", (state) =>
      engine.settleStep(
        state,
        step,
        name,
        options?.patched === true,
        options?.waiting === true,
        () =>
          AsyncResult.success(value, {
            waiting: options?.waiting,
            timestamp: 0
          })
      ))
  }
  loadedMore(name: string, page: unknown): this {
    return this.act(
      "loadedMore",
      "acting",
      (state) =>
        engine.settleMore(
          state,
          this.name("loadedMore"),
          name,
          (pages) => [...pages, page]
        )
    )
  }
  loadMoreFailed(name: string, error: unknown): this {
    return this.act(
      "loadMoreFailed",
      "acting",
      (state) =>
        engine.settleMore(
          state,
          this.name("loadMoreFailed"),
          name,
          (pages) => pages,
          { _tag: "Failed", error }
        )
    )
  }
  loadFailed(name: string, ...rest: Array<any>): this {
    const step = this.name("loadFailed")
    if (engine.isKeyed(this.state, name)) {
      const [args, error, options] = rest
      return this.act(
        "loadFailed",
        "acting",
        (state) =>
          engine.loadKeyedStep(state, step, name, [{
            args,
            error,
            waiting: options?.waiting
          }])
      )
    }
    const [error, options] = rest as [
      unknown,
      { readonly waiting?: boolean | undefined } | undefined
    ]
    return this.act("loadFailed", "acting", (state) =>
      engine.settleStep(
        state,
        step,
        name,
        false,
        options?.waiting === true,
        (previousSuccess) =>
          AsyncResult.failure(Cause.fail(error), {
            previousSuccess,
            waiting: options?.waiting
          })
      ))
  }
  loadedMany(name: string, entries: ReadonlyArray<Steps.KeyedLoad<any>>): this {
    return this.act(
      "loadedMany",
      "acting",
      (state) =>
        engine.loadKeyedStep(state, this.name("loadedMany"), name, entries)
    )
  }

  emitted(events: ReadonlyArray<unknown>): this {
    return this.replace(
      engine.acknowledgeEmitted(this.state, events, this.name("emitted"))
    )
  }
  sent(owner: Component.Headless.Any, message: unknown): this {
    return this.replace(
      engine.acknowledgeSent(this.state, owner, message, this.name("sent"))
    )
  }
  keepPending(target: Steps.Target | string): this {
    return this.replace(
      engine.keep(this.state, target, this.name("keepPending"))
    )
  }
  check(f: (current: any) => void): this {
    f(this.current)
    return this
  }

  expectExact(targets: ReadonlyArray<Steps.Target>): this {
    const pending = this.state.pending
    if (
      pending.length !== targets.length ||
      !pending.every((entry, index) => {
        const target = targets[index]
        return target !== undefined && engine.matches(target, entry)
      })
    ) {
      throw new Error(
        `${this.name("expectExact")}: expected ${
          targets.length === 0
            ? "nothing"
            : Array.from(targets, (target) =>
              target === undefined
                ? "undefined"
                : engine.describeTarget(target)).join(", ")
        }; pending: ${engine.describePending(pending)}`
      )
    }
    return this
  }
  expectHas(target: Steps.Target): this {
    const pending = this.state.pending
    if (!pending.some((entry) => engine.matches(target, entry))) {
      throw new Error(
        `${this.name("expectHas")}: ${
          engine.describeTarget(target)
        } is not pending; pending: ${engine.describePending(pending)}`
      )
    }
    return this
  }
  expectNone(): this {
    if (this.state.pending.length > 0) {
      throw new Error(
        `${this.name("expectNone")}: pending: ${
          engine.describePending(this.state.pending)
        }`
      )
    }
    return this
  }
}

/**
 * A cursor as a scoped Effect: `begin` makes it, and the scope's finalizer runs the end check once
 * the scope closes with a success. A failed test already has its failure, so the end check doesn't add
 * a second one. The finalizer runs after the test's own code has returned, so its error takes the stack
 * of where the test called `make`: a trace that starts at `make`'s caller, where the engine supports it.
 *
 * @internal
 */
export const scoped = <S extends Cursor>(
  make: Function,
  begin: () => S
): Effect.Effect<S, never, Scope.Scope> => {
  const site = callSite(make)
  return Effect.acquireRelease(
    Effect.sync(begin),
    (steps, exit) =>
      Exit.isSuccess(exit)
        ? Effect.sync(() => atSite(site, () => steps.finish()))
        : Effect.void
  )
}

/** @internal */
export const callSite = (fn: Function): Error => {
  const site = new Error()
  ;(Error as { captureStackTrace?: (target: object, fn: Function) => void })
    .captureStackTrace?.(site, fn)
  return site
}

/** @internal */
export const atSite = <A>(site: Error, f: () => A): A => {
  try {
    return f()
  } catch (error) {
    if (error instanceof Error && site.stack !== undefined) {
      error.stack = `${error.name}: ${error.message}\n${
        site.stack.split("\n").slice(1).join("\n")
      }`
    }
    throw error
  }
}

/**
 * The record every kind shares, from the engine's.
 *
 * @internal
 */
export const baseRecord = (state: engine.State<any, any, any, any>) => ({
  component: state.component,
  props: state.props,
  pending: state.pending,
  emitted: state.emitted,
  sent: state.sent,
  interrupted: state.interrupted,
  loadingMore: state.loadingMore,
  subscriptions: state.subscriptions,
  queryInfo: state.queryInfo,
  get reports() {
    return engine.reportsOf(state)
  }
})

/**
 * The engine record after `init` with `props`.
 *
 * @internal
 */
export const initial = (
  component: Component.Any,
  props: unknown
): engine.State<any, any, any, any> => {
  const first = component.init(props)
  const fields: engine.Fields<any, any, any, any> = {
    // The record is stored with its types erased; each kind's cursor restores them.
    component: component as Component.Component<
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      never
    >,
    props,
    model: first.model,
    results: undefined,
    pending: [],
    emitted: [],
    sent: [],
    interrupted: [],
    loadingMore: [],
    defaultPrevented: false,
    ack: engine.noAck
  }
  const empty = engine.record(fields, () => engine.expandedView(fields))
  return engine.apply(empty, first)
}
