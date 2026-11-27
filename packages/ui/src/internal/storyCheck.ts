/**
 * Generates scripts up front so removing a step preserves the other steps' indices and seeds.
 * Each settlement selects from the work pending at that step, so removing earlier steps can
 * change which work it settles.
 *
 * @internal
 */
import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as Query from "../Query.ts"
import type { Pending } from "../testing/Steps.ts"
import { isNoop, isNoopSchema, noop } from "./noop.ts"
import { atSite, callSite, type Cursor } from "./steps.ts"
import * as engine from "./story.ts"
import * as rules from "./storyRules.ts"

/** @internal */
export type Source =
  | Schema.Top
  | Arbitrary.Arbitrary<unknown>
  | ((input: unknown) => Arbitrary.Arbitrary<unknown>)

interface Results {
  readonly success?: Source | undefined
  readonly error?: Source | undefined
}

/** @internal */
export interface Options extends Arbitrary.CheckOptions {
  readonly messages?: Source | undefined
  readonly commands?:
    | ReadonlyArray<readonly [Command.Definition.Any, Results]>
    | undefined
  readonly transition?: ((update: any) => boolean | void) | undefined
  readonly invariant?: ((story: any) => boolean | void) | undefined
}

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

/**
 * One way to settle a piece of work: a step on `args`, printed as `target`. `source` gives the
 * value it takes, when it takes one, from `input` when it's a function.
 */
interface Action {
  readonly step: string
  readonly args: ReadonlyArray<unknown>
  readonly target: string
  readonly source?: Source | undefined
  readonly input?: unknown
  /** Prints the value, when `source` isn't a Schema. */
  readonly schema?: Schema.Top | undefined
}

interface Failure extends rules.Problem {
  readonly lines: ReadonlyArray<string>
  readonly state: engine.State<any, any, any, any>
}

interface Context {
  readonly start: (component: Component.Any) => Story
  /** None for `Schema.Never`, which makes settle-only scripts. */
  readonly messages: Source | undefined
  readonly commands: ReadonlyMap<string, Results>
  readonly rules: rules.Rules
}

const derived = new WeakMap<Schema.Top, Arbitrary.Arbitrary<unknown>>()

const arbitraryOf = (
  source: Source,
  input?: unknown
): Arbitrary.Arbitrary<unknown> => {
  if (Arbitrary.isArbitrary(source)) return source
  if (!Schema.isSchema(source)) return source(input)
  let out = derived.get(source)
  if (out === undefined) {
    out = isNoopSchema(source)
      ? Arbitrary.Constant(noop)
      : Arbitrary.schema(source as Schema.Schema<unknown>)
    derived.set(source, out)
  }
  return out
}

const sample = (
  source: Source,
  seed: number,
  input: unknown,
  what: string
): Effect.Effect<unknown> =>
  Arbitrary.sampleEffect(arbitraryOf(source, input), { count: 1, seed }).pipe(
    Effect.map((values) => values[0]),
    Effect.catch((error) =>
      Effect.die(
        new Error(
          `Story.check: no ${what} could be generated after ${error.discards} discards`
        )
      )
    )
  )

const inhabited = (source: Source | undefined): source is Source =>
  source !== undefined &&
  !(Schema.isSchema(source) && SchemaAST.isNever(source.ast))

const show = (source: Source | undefined, value: unknown): string =>
  isNoop(value)
    ? "Component.noop"
    : engine.show(Schema.isSchema(source) ? source : undefined, value)

const valued = (
  step: string,
  args: ReadonlyArray<unknown>,
  target: string,
  source: Source | undefined,
  input?: unknown,
  schema?: Schema.Top
): ReadonlyArray<Action> =>
  inhabited(source) ? [{ step, args, target, source, input, schema }] : []

/**
 * The pages a fetch of an infinite query loads, as the runtime walks them: from the first, until
 * `next` ends the list or it holds the `held` pages it refetches, one on a cold load.
 */
const walkOf = (
  def: ReturnType<typeof Query.defOf>,
  page: Schema.Top,
  held: number
): Source | undefined =>
  inhabited(page)
    ? Arbitrary.map(
      Arbitrary.array(arbitraryOf(page), {
        minLength: Math.max(1, held),
        maxLength: Math.max(1, held)
      }),
      (sampled) => {
        const pages: Array<unknown> = []
        for (const value of sampled) {
          pages.push(value)
          if (Option.isNone(def.list!.next(value, pages))) break
        }
        return pages
      }
    )
    : undefined

/**
 * How `entry` can settle now, when it's the one a step on its Command would pick: the oldest
 * running one, or the oldest that waits on refetches. Results come from its `commands` entry,
 * else from its `Service`'s Schemas.
 */
const commandActions = (
  ctx: Context,
  state: engine.State<any, any, any, any>,
  entry: Pending<any>
): ReadonlyArray<Action> => {
  const command = entry.command
  const waits = entry.status === "awaiting"
  const oldest = (same: (other: Pending<any>) => boolean): boolean =>
    state.pending.find((other) =>
      (waits ? engine.isWaiting(other) : other.status === "running") &&
      same(other)
    ) === entry
  if (!oldest((other) => engine.matches(command, other))) return []
  const args = [command]
  // By name when a step on the name alone would pick it too, else with its args.
  const target = oldest((other) => other.command.name === command.name)
    ? command.name
    : engine.describe(command)
  if (waits) return [{ step: "waitExpired", args, target }]
  const given = ctx.commands.get(command.name)
  const success = given?.success ?? command.service?.success
  if (success === undefined) {
    throw new Error(
      `Story.check: ${command.name} has no success Schema to settle it from, as a Command.make Command: give it one in \`commands\``
    )
  }
  const stream = command._tag === "Stream"
  return [
    ...valued(stream ? "next" : "resolve", args, target, success, command.args),
    ...(stream ? [{ step: "end", args, target }] : []),
    ...(command.reject === undefined ? [] : valued(
      "fail",
      args,
      target,
      given?.error ?? command.service?.error,
      command.args
    ))
  ]
}

const queryActions = (
  state: engine.State<any, any, any, any>
): Array<ReadonlyArray<Action>> => {
  const out: Array<ReadonlyArray<Action>> = []
  for (const { args, held, load, more, query } of engine.settleable(state)) {
    const def = Query.defOf(query.query)
    const name = JSON.stringify(query.name)
    // An infinite query's `success` is `Schema.Array(page)`.
    const page = def.list === undefined
      ? undefined
      : (def.success as Schema.$Array<Schema.Top>).value
    if (load) {
      const at = query.keyed ? [query.name, args] : [query.name]
      const target = query.keyed ? `${name}, ${show(def.args, args)}` : name
      out.push([
        ...(page === undefined
          ? valued("loaded", at, target, def.success)
          : valued(
            "loaded",
            at,
            target,
            walkOf(def, page, held),
            undefined,
            def.success
          )),
        ...valued("loadFailed", at, target, def.error)
      ])
    }
    if (page !== undefined && more) {
      out.push([
        ...valued("loadedMore", [query.name], name, page),
        ...valued("loadMoreFailed", [query.name], name, def.error)
      ])
    }
  }
  return out
}

/** Everything in flight a settlement can pick, oldest Command first, each with its actions. */
const settleable = (
  ctx: Context,
  state: engine.State<any, any, any, any>
): ReadonlyArray<ReadonlyArray<Action>> =>
  [
    ...state.pending.map((entry) => commandActions(ctx, state, entry)),
    ...queryActions(state)
  ].filter((actions) => actions.length > 0)

const keepAll = (story: Story, lines: Array<string>): void => {
  const { commands, more, queries } = engine.blocking(story.state)
  for (const name of new Set(commands.map((entry) => entry.command.name))) {
    lines.push(`.keepPending(${name})`)
  }
  for (const entry of commands) story.keepPending(entry.command)
  for (
    const name of new Set([
      ...more,
      ...queries.map((entry) => entry.name)
    ])
  ) {
    lines.push(`.keepPending(${JSON.stringify(name)})`)
    story.keepPending(name)
  }
}

const runScript = (
  ctx: Context,
  script: ReadonlyArray<Step>
): Effect.Effect<boolean, Failure> =>
  Effect.gen(function*() {
    // A defect in `init` fails every run alike: there is nothing to shrink.
    const story = ctx.start(ctx.rules.component)
    const component = story.state.component
    const lines = [
      `Story.start(${component.definition.name}, ${
        show(component.props, story.state.props)
      })`
    ]
    const failed = (problem: rules.Problem): Effect.Effect<never, Failure> =>
      Effect.fail({ ...problem, lines, state: story.state })
    const attempt = (f: () => void): rules.Problem | undefined =>
      rules.step(ctx.rules, story, f, () => story.current, lines)
    const first = attempt(() => {})
    if (first !== undefined) return yield* failed(first)
    for (const step of script) {
      let problem: rules.Problem | undefined
      if (step._tag === "Settle") {
        const candidates = settleable(ctx, story.state)
        if (candidates.length === 0) continue
        const actions = candidates[step.pick % candidates.length]!
        const { args, input, schema, source, step: name, target } =
          actions[step.choice % actions.length]!
        const value = source === undefined ? [] : [
          yield* sample(
            source,
            step.seed,
            input,
            `value for ${name}(${target})`
          )
        ]
        problem = attempt(() => {
          lines.push(
            `.${name}(${
              [target, ...value.map((value) => show(schema ?? source, value))]
                .join(", ")
            })`
          )
          story[name](...args, ...value)
        })
      } else {
        const message = step._tag === "Message"
          ? step.message
          : yield* sample(ctx.messages!, step.seed, story.model, "message")
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

const scriptOf = (
  messages: Source | undefined
): Arbitrary.Arbitrary<ReadonlyArray<Step>> => {
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
  if (messages === undefined) return Arbitrary.array(settle)
  // A function's messages depend on the Model, so the run samples them by seed.
  const message: Arbitrary.Arbitrary<Step> =
    Schema.isSchema(messages) || Arbitrary.isArbitrary(messages)
      ? Arbitrary.map(
        arbitraryOf(messages),
        (message) => ({ _tag: "Message", message })
      )
      : Arbitrary.map(seed, (seed) => ({ _tag: "Sampled", seed }))
  const settles = Arbitrary.schema(Schema.Boolean, { shrink: () => [] })
  return Arbitrary.array(
    Arbitrary.flatMap(settles, (yes) => yes ? settle : message)
  )
}

const report = (
  failure: Failure,
  result: Arbitrary.Falsified<unknown, Failure>
): string =>
  `Story.check: ${failure.reason}, after ${result.runs} run(s) and ${result.shrinks} shrink(s):\n\n${
    failure.lines.join("\n  ")
  }\n\n  ${
    rules.describe(failure, failure.state)
  }\n\nReplay it with { replay: ${JSON.stringify(result.replay)} }`

/**
 * Runs generated scripts on the cursors `start` makes, and dies with the shrunk failing script.
 *
 * @internal
 */
export const check = (
  site: Function,
  component: Component.Any,
  start: (component: Component.Any) => Story,
  options: Options = {}
): Effect.Effect<void> => {
  const where = callSite(site)
  const messages = options.messages ?? (component.message as Schema.Top)
  const ctx: Context = {
    start,
    messages: inhabited(messages) ? messages : undefined,
    commands: new Map(
      (options.commands ?? []).map((
        [definition, results]
      ) => [Command.nameOf(definition), results])
    ),
    rules: rules.make(component, options)
  }
  return Effect.flatMap(
    Arbitrary.checkEffect(
      scriptOf(ctx.messages),
      (script) => runScript(ctx, script),
      options
    ),
    (result) =>
      result._tag === "Passed" ?
        Effect.void :
        Effect.sync(() =>
          atSite(where, () => {
            throw new Error(
              result._tag === "Falsified" &&
                result.failure._tag === "PropertyError"
                ? report(result.failure.error, result)
                : `Story.check: ${Arbitrary.formatCheckFailure(result)}`
            )
          })
        )
  )
}
