/**
 * The runner behind `Story.check`: a generated script of messages and settlements, run on a
 * Story cursor with the public steps, and the checks after every step.
 *
 * A script is generated up front, so shrinking removes steps without changing the choices of the
 * others. A settlement picks one piece of in-flight work by index and samples its result with its
 * own seed, so a shrunk script and a replay make the same choices.
 *
 * @internal
 */
import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as Query from "../Query.ts"
import type { Pending } from "../testing/Steps.ts"
import { isNoop, isNoopSchema, noop } from "./noop.ts"
import { boundOf } from "./queries.ts"
import { callSite, type Cursor } from "./steps.ts"
import * as engine from "./story.ts"

/**
 * Where generated values come from: a Schema, an Arbitrary, or a function of an input, the Model
 * or a Command's args, that returns an Arbitrary.
 *
 * @internal
 */
export type Source =
  | Schema.Top
  | Arbitrary.Arbitrary<unknown>
  | ((input: unknown) => Arbitrary.Arbitrary<unknown>)

/** @internal */
export interface Options extends Arbitrary.CheckOptions {
  readonly messages?: Source | undefined
  readonly commands?:
    | ReadonlyArray<
      readonly [
        Command.Definition.Any,
        {
          readonly success?: Source | undefined
          readonly error?: Source | undefined
        }
      ]
    >
    | undefined
  readonly invariant?: ((story: any) => boolean | void) | undefined
}

/** The cursor the runner drives: a Story's. */
type Story = Cursor & { readonly [step: string]: any }

type Step =
  | { readonly _tag: "Message"; readonly message: unknown }
  | { readonly _tag: "Sampled"; readonly seed: number }
  | {
    readonly _tag: "Settle"
    readonly pick: number
    readonly choice: number
    readonly seed: number
  }

/** Values sampled by seed, and the Schema that prints them, when there is one. */
interface Gen {
  readonly sample: (seed: number, input: unknown) => Effect.Effect<unknown>
  readonly schema: Schema.Top | undefined
}

/** One way to settle a piece of work. `gen` gives its value, when it takes one. */
interface Action {
  readonly gen?: Gen | undefined
  readonly input?: unknown
  readonly line: (value: unknown) => string
  readonly run: (story: Story, value: unknown) => void
}

interface Failure {
  readonly reason: string
  readonly lines: ReadonlyArray<string>
  readonly state: engine.State<any, any, any, any>
}

interface Context {
  readonly component: Component.Any
  readonly start: () => Story
  readonly messages: Gen | undefined
  readonly commands: ReadonlyMap<
    string,
    { readonly success?: Gen | undefined; readonly error?: Gen | undefined }
  >
  readonly invariant: ((story: any) => boolean | void) | undefined
  readonly isModel: (u: unknown) => boolean
}

const compiled = new WeakMap<Schema.Top, Arbitrary.Arbitrary<unknown>>()

const arbitraryOf = (schema: Schema.Top): Arbitrary.Arbitrary<unknown> => {
  let out = compiled.get(schema)
  if (out === undefined) {
    out = isNoopSchema(schema)
      ? Arbitrary.Constant(noop)
      : Arbitrary.schema(schema as Schema.Schema<unknown>)
    compiled.set(schema, out)
  }
  return out
}

const isNever = (schema: Schema.Top): boolean => SchemaAST.isNever(schema.ast)

const sampleWith = (
  arbitrary: Arbitrary.Arbitrary<unknown>,
  seed: number,
  what: string
): Effect.Effect<unknown> =>
  Arbitrary.sampleEffect(arbitrary, { count: 1, seed }).pipe(
    Effect.map((values) => values[0]),
    Effect.catch((error) =>
      Effect.die(
        new Error(
          `Story.check: no ${what} could be generated after ${error.discards} discards`
        )
      )
    )
  )

/** A source as a `Gen`. `schema` prints the values of an Arbitrary or a function. */
const genOf = (
  source: Source,
  what: string,
  schema?: Schema.Top | undefined
): Gen => {
  if (Arbitrary.isArbitrary(source)) {
    return { sample: (seed) => sampleWith(source, seed, what), schema }
  }
  if (Schema.isSchema(source)) {
    const arbitrary = arbitraryOf(source)
    return {
      sample: (seed) => sampleWith(arbitrary, seed, what),
      schema: source
    }
  }
  return {
    sample: (seed, input) =>
      Effect.suspend(() => sampleWith(source(input), seed, what)),
    schema
  }
}

/** A Schema's `Gen`, or none for `Schema.Never`, which has no values. */
const schemaGen = (
  schema: Schema.Top | undefined,
  what: string
): Gen | undefined =>
  schema === undefined || isNever(schema) ? undefined : genOf(schema, what)

const show = (schema: Schema.Top | undefined, value: unknown): string =>
  isNoop(value) ? "Component.noop" : engine.show(schema, value)

/** A Command's result Schemas: its `commands` entry, else its `Service`'s. */
const resultsOf = (
  ctx: Context,
  command: Pending<any>["command"]
): { readonly success: Gen; readonly error: Gen | undefined } => {
  const given = ctx.commands.get(command.name)
  const service = command.service
  const success = given?.success ??
    schemaGen(service?.success, `result of ${command.name}`)
  return {
    success: success ?? {
      schema: undefined,
      sample: () =>
        Effect.die(
          new Error(
            `Story.check: ${command.name} has no success Schema to settle it from, as a Command.make Command: give it one in \`commands\``
          )
        )
    },
    error: given?.error ??
      schemaGen(service?.error, `failure of ${command.name}`)
  }
}

/** How a step names a pending Command: by name when it's the first match, else with its args. */
const targetOf = (
  state: engine.State<any, any, any, any>,
  entry: Pending<any>,
  same: (other: Pending<any>) => boolean
): string =>
  state.pending.find((other) =>
      same(other) && other.command.name === entry.command.name
    ) === entry
    ? entry.command.name
    : engine.describe(entry.command)

const commandActions = (
  ctx: Context,
  state: engine.State<any, any, any, any>,
  entry: Pending<any>
): ReadonlyArray<Action> | undefined => {
  const command = entry.command
  if (entry.status === "awaiting") {
    const waits = (other: Pending<any>) =>
      other.awaiting !== undefined && other.awaiting.length > 0
    if (
      !waits(entry) ||
      state.pending.find((other) =>
          waits(other) && engine.matches(command, other)
        ) !== entry
    ) return undefined
    const target = targetOf(state, entry, waits)
    return [{
      line: () => `.waitExpired(${target})`,
      run: (story) => story.waitExpired(command)
    }]
  }
  const running = (other: Pending<any>) => other.status === "running"
  if (
    entry.status !== "running" ||
    state.pending.find((other) =>
        running(other) && engine.matches(command, other)
      ) !== entry
  ) return undefined
  const target = targetOf(state, entry, running)
  const { error, success } = resultsOf(ctx, command)
  const actions: Array<Action> = command._tag === "Stream"
    ? [
      {
        gen: success,
        input: command.args,
        line: (value) => `.next(${target}, ${show(success.schema, value)})`,
        run: (story, value) => story.next(command, value)
      },
      { line: () => `.end(${target})`, run: (story) => story.end(command) }
    ]
    : [{
      gen: success,
      input: command.args,
      line: (value) => `.resolve(${target}, ${show(success.schema, value)})`,
      run: (story, value) => story.resolve(command, value)
    }]
  if (command.reject !== undefined && error !== undefined) {
    actions.push({
      gen: error,
      input: command.args,
      line: (value) => `.fail(${target}, ${show(error.schema, value)})`,
      run: (story, value) => story.fail(command, value)
    })
  }
  return actions
}

/** The query entries that wait for a result, unloaded or awaited, less those under a live patch. */
const queryActions = (
  state: engine.State<any, any, any, any>
): Array<ReadonlyArray<Action>> => {
  const out: Array<ReadonlyArray<Action>> = []
  const unloaded = engine.unloaded(state)
  const awaited = state.pending.flatMap((entry) => entry.awaiting ?? [])
  for (const { entries, query } of engine.currentEntries(state)) {
    const def = Query.defOf(query.query)
    const name = query.name
    const success = schemaGen(def.success, `result of "${name}"`)!
    const error = schemaGen(def.error, `failure of "${name}"`)
    for (const { args, argsKey } of entries) {
      const waits = unloaded.some((entry) =>
        entry.name === name && entry.argsKey === argsKey
      ) ||
        awaited.some((entry) =>
          entry.name === name && def.argsKey(entry.args) === argsKey
        )
      if (!waits || engine.patcherOf(state, name, argsKey) !== undefined) {
        continue
      }
      const at = query.keyed ? `, ${show(def.args, args)}` : ""
      const before = query.keyed ? [args] : []
      const actions: Array<Action> = [{
        gen: success,
        line: (value) =>
          `.loaded(${JSON.stringify(name)}${at}, ${show(def.success, value)})`,
        run: (story, value) =>
          story.loaded(name, ...before, value)
      }]
      if (error !== undefined) {
        actions.push({
          gen: error,
          line: (value) =>
            `.loadFailed(${JSON.stringify(name)}${at}, ${
              show(def.error, value)
            })`,
          run: (story, value) => story.loadFailed(name, ...before, value)
        })
      }
      out.push(actions)
    }
  }
  return out
}

/** The pending load mores that hold pages at their args, less those under a live patch. */
const moreActions = (
  state: engine.State<any, any, any, any>
): Array<ReadonlyArray<Action>> =>
  state.loadingMore.flatMap((name) => {
    const query = boundOf(state.component)?.byName.get(name)
    const current = state.queryInfo().find((info) => info.name === name)
    if (query === undefined || current?.args === undefined) return []
    const def = Query.defOf(query.query)
    const argsKey = def.argsKey(current.args)
    if (
      engine.patcherOf(state, name, argsKey) !== undefined ||
      engine.storedAt(state, name, argsKey)._tag === "None"
    ) return []
    // An infinite query's `success` is `Schema.Array(page)`.
    const page = (def.success as Schema.$Array<Schema.Top>).value
    const pages = schemaGen(page, `page of "${name}"`)!
    const error = schemaGen(def.error, `failure of "${name}"`)
    const actions: Array<Action> = [{
      gen: pages,
      line: (value) =>
        `.loadedMore(${JSON.stringify(name)}, ${show(page, value)})`,
      run: (story, value) => story.loadedMore(name, value)
    }]
    if (error !== undefined) {
      actions.push({
        gen: error,
        line: (value) =>
          `.loadMoreFailed(${JSON.stringify(name)}, ${show(def.error, value)})`,
        run: (story, value) => story.loadMoreFailed(name, value)
      })
    }
    return [actions]
  })

/** Everything in flight a settlement can pick, oldest Command first. */
const settleable = (
  ctx: Context,
  state: engine.State<any, any, any, any>
): ReadonlyArray<ReadonlyArray<Action>> => [
  ...state.pending.flatMap((entry) => {
    const actions = commandActions(ctx, state, entry)
    return actions === undefined ? [] : [actions]
  }),
  ...queryActions(state),
  ...moreActions(state)
]

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * The checks after `init` and every step that applied: the Model against its Schema, then the
 * invariant, then the outputs, checked against their Schemas and acknowledged.
 */
const checkStep = (
  ctx: Context,
  story: Story,
  lines: Array<string>
): string | undefined => {
  if (!ctx.isModel(story.model)) return "the Model doesn't satisfy its Schema"
  if (ctx.invariant !== undefined) {
    try {
      if (ctx.invariant(story.current) === false) {
        return "the invariant returned false"
      }
    } catch (error) {
      return `the invariant threw: ${messageOf(error)}`
    }
  }
  const state = story.state
  const events = state.component.events as Schema.Codec<unknown, unknown>
  const event = state.emitted.find((event) => !Schema.is(events)(event))
  if (event !== undefined) {
    return `the event ${show(events, event)} doesn't satisfy the events Schema`
  }
  if (state.emitted.length > 0) {
    lines.push(
      `.emitted(${
        state.emitted.map((event) => show(events, event)).join(", ")
      })`
    )
    story.emitted(...state.emitted)
  }
  for (const send of state.sent) {
    const receives = send.owner.receives as Schema.Codec<unknown, unknown>
    if (!Schema.is(receives)(send.message)) {
      return `the send ${
        show(receives, send.message)
      } doesn't satisfy the receives Schema of ${send.owner.definition.name}`
    }
    lines.push(
      `.sent(${send.owner.definition.name}, ${show(receives, send.message)})`
    )
    story.sent(send.owner, send.message)
  }
  return undefined
}

/** Marks what blocks a message step as kept, as a written story would. */
const keepAll = (story: Story, lines: Array<string>): void => {
  const { commands, queries } = engine.keepable(story.state)
  for (const name of new Set(commands.map((entry) => entry.command.name))) {
    lines.push(`.keepPending(${name})`)
  }
  for (const entry of commands) {
    if (!story.state.ack.kept.includes(entry)) story.keepPending(entry.command)
  }
  for (const name of queries) {
    lines.push(`.keepPending(${JSON.stringify(name)})`)
    story.keepPending(name)
  }
}

const runScript = (
  ctx: Context,
  script: ReadonlyArray<Step>
): Effect.Effect<boolean, Failure> =>
  Effect.gen(function*() {
    const component = ctx.component
    // A defect in `init` fails every run alike: there is nothing to shrink.
    const story = ctx.start()
    const lines = [
      `Story.start(${component.definition.name}, ${
        show(component.props, story.state.props)
      })`
    ]
    const failed = (reason: string): Effect.Effect<never, Failure> =>
      Effect.fail({ reason, lines, state: story.state })
    // A step that throws fails the run, as it fails a written story.
    const attempt = (f: () => void): string | undefined => {
      try {
        f()
        return checkStep(ctx, story, lines)
      } catch (error) {
        return `the step threw: ${messageOf(error)}`
      }
    }
    const first = attempt(() => {})
    if (first !== undefined) return yield* failed(first)
    for (const step of script) {
      let problem: string | undefined
      if (step._tag === "Settle") {
        const candidates = settleable(ctx, story.state)
        if (candidates.length === 0) continue
        const actions = candidates[step.pick % candidates.length]!
        const action = actions[step.choice % actions.length]!
        const value = action.gen === undefined
          ? undefined
          : yield* action.gen.sample(step.seed, action.input)
        problem = attempt(() => {
          lines.push(action.line(value))
          action.run(story, value)
        })
      } else {
        const message = step._tag === "Message"
          ? step.message
          : yield* ctx.messages!.sample(step.seed, story.model)
        problem = attempt(() => {
          keepAll(story, lines)
          lines.push(`.send(${show(component.message, message)})`)
          story.send(message)
        })
      }
      if (problem !== undefined) return yield* failed(problem)
    }
    return true
  })

// Picks and choices shrink to the first, and seeds don't shrink: a smaller seed is no simpler value.
const index = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
  { shrink: (n) => n === 0 ? [] : [0] }
)
const seed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 })),
  { shrink: () => [] }
)
const settle: Arbitrary.Arbitrary<Step> = Arbitrary.map(
  Arbitrary.all([index, index, seed]),
  ([pick, choice, seed]) => ({ _tag: "Settle", pick, choice, seed })
)
const settles = Arbitrary.schema(Schema.Boolean, { shrink: () => [] })

const scriptOf = (
  messages: Source | undefined
): Arbitrary.Arbitrary<ReadonlyArray<Step>> => {
  const message: Arbitrary.Arbitrary<Step> | undefined = messages === undefined
    ? undefined
    : Arbitrary.isArbitrary(messages) || Schema.isSchema(messages)
    ? Arbitrary.map(
      Schema.isSchema(messages) ? arbitraryOf(messages) : messages,
      (message): Step => ({ _tag: "Message", message })
    )
    : Arbitrary.map(seed, (seed): Step => ({ _tag: "Sampled", seed }))
  return Arbitrary.array(
    message === undefined
      ? settle
      : Arbitrary.flatMap(settles, (yes) => yes ? settle : message)
  )
}

const report = (
  failure: Failure,
  result: Arbitrary.Falsified<unknown, Failure>
): string =>
  `Story.check: ${failure.reason}, after ${result.runs} run(s) and ${result.shrinks} shrink(s):\n\n${
    failure.lines.join("\n  ")
  }\n\n  model: ${
    show(failure.state.component.model, failure.state.model)
  }\n  pending: ${
    engine.describePending(failure.state.pending)
  }\n\nReplay it with { replay: ${JSON.stringify(result.replay)} }`

/**
 * Runs generated scripts on the cursors `start` makes, and dies with the shrunk failing script.
 *
 * @internal
 */
export const check = (
  site: Function,
  component: Component.Any,
  start: () => Story,
  options: Options = {}
): Effect.Effect<void> => {
  const where = callSite(site)
  const messageSchema = component.message as Schema.Top
  const source: Source | undefined = options.messages ??
    (isNever(messageSchema) ? undefined : messageSchema)
  const ctx: Context = {
    component,
    start,
    messages: source === undefined
      ? undefined
      : genOf(source, "message", messageSchema),
    commands: new Map(
      (options.commands ?? []).map(([definition, results]) => {
        const name = Command.nameOf(definition)
        return [name, {
          success: results.success === undefined
            ? undefined
            : genOf(results.success, `result of ${name}`),
          error: results.error === undefined
            ? undefined
            : genOf(results.error, `failure of ${name}`)
        }]
      })
    ),
    invariant: options.invariant,
    isModel: Schema.is(component.model as Schema.Codec<unknown, unknown>)
  }
  return Effect.flatMap(
    Arbitrary.checkEffect(
      scriptOf(source),
      (script) => runScript(ctx, script),
      options
    ),
    (result) => {
      if (result._tag === "Passed") return Effect.void
      const error = new Error(
        result._tag === "Falsified" && result.failure._tag === "PropertyError"
          ? report(result.failure.error, result)
          : `Story.check: ${Arbitrary.formatCheckFailure(result)}`
      )
      if (where.stack !== undefined) {
        error.stack = `Error: ${error.message}\n${
          where.stack.split("\n").slice(1).join("\n")
        }`
      }
      return Effect.die(error)
    }
  )
}
