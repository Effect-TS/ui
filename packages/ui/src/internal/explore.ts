/**
 * The search behind `Story.explore`: every story within a depth over listed messages and Command
 * results, breadth first, so the first failure found is a shortest one.
 *
 * Every move runs through the public steps on a Story cursor, so every path is a story someone could
 * write and the report is one. Records that agree on everything a later move can read share the rest
 * of the search.
 *
 * @internal
 */
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as MutableHashSet from "effect/MutableHashSet"
import type * as Schema from "effect/Schema"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import type { Pending } from "../testing/Steps.ts"
import type {
  Explored,
  ExploredCommand,
  ExploreOptions
} from "../testing/Story.ts"
import { isNoop, isNoopSchema, noop } from "./noop.ts"
import { atSite, callSite, type Cursor, initial, stateOf } from "./steps.ts"
import * as engine from "./story.ts"
import * as rules from "./storyRules.ts"

type Story = Cursor & { send(message: unknown): unknown }
type State = engine.State<any, any, any, any>
type Issued = Pending<any>["command"]

interface Node {
  readonly parent: Node | undefined
  readonly lines: () => ReadonlyArray<string>
}

interface Move {
  readonly lines: () => ReadonlyArray<string>
  readonly run: (story: Story) => void
}

/**
 * A pending Command's listed results, and what tells its run from another with the same name and
 * args: the messages the results deliver, all a later move can do with it.
 */
interface Settles {
  readonly success: ReadonlyArray<unknown>
  readonly error: ReadonlyArray<unknown>
  readonly key: unknown
}

const values = (
  list:
    | ReadonlyArray<unknown>
    | ((input: any) => ReadonlyArray<unknown>)
    | undefined,
  input: unknown
): ReadonlyArray<unknown> =>
  list === undefined ? [] : typeof list === "function" ? list(input) : list

const show = (schema: Schema.Top | undefined, value: unknown): string =>
  isNoop(value) ? "Component.noop" : engine.show(schema, value)

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null ||
    (proto === Array.prototype && Array.isArray(value))
}

/**
 * Preserve property order and shared references when comparing plain data. Opaque objects,
 * functions and accessors can hide references, so records containing them must not merge with
 * copies. Pairing objects one-to-one also terminates comparison of cycles.
 */
const same = (
  as: ReadonlyArray<unknown>,
  bs: ReadonlyArray<unknown>
): boolean => {
  const left = new Map<object, object>()
  const right = new Map<object, object>()
  let copied = false
  let opaque = false
  const go = (a: unknown, b: unknown): boolean => {
    if (typeof a === "function" || typeof b === "function") {
      opaque = true
      return a === b
    }
    if (
      typeof a !== "object" || typeof b !== "object" || a === null || b === null
    ) return Object.is(a, b)
    const paired = left.get(a)
    if (paired !== undefined || right.has(b)) return paired === b
    left.set(a, b)
    right.set(b, a)
    if (!isPlain(a)) {
      opaque = true
      return a === b
    }
    if (a !== b) copied = true
    if (
      Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) ||
      Object.isExtensible(a) !== Object.isExtensible(b)
    ) return false
    const keys = Reflect.ownKeys(a)
    const others = Reflect.ownKeys(b)
    if (keys.length !== others.length) return false
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== others[i]) return false
      const x = Reflect.getOwnPropertyDescriptor(a, keys[i])!
      const y = Reflect.getOwnPropertyDescriptor(b, keys[i])!
      if (
        x.enumerable !== y.enumerable || x.writable !== y.writable ||
        x.configurable !== y.configurable
      ) return false
      if (x.get !== undefined || x.set !== undefined) {
        opaque = true
        if (x.get !== y.get || x.set !== y.set) return false
      } else if (!go(x.value, y.value)) return false
    }
    return true
  }
  return as.length === bs.length && as.every((a, i) => go(a, bs[i])) &&
    !(copied && opaque)
}

/**
 * A hash that agrees with `same`: plain objects and arrays by their data properties to a few levels,
 * without running a getter, and any other object by reference.
 */
const hashOf = (value: unknown, depth: number): number => {
  if (typeof value === "function") return Hash.random(value)
  if (typeof value !== "object" || value === null) return Hash.hash(value)
  if (!isPlain(value)) return Hash.random(value)
  let h = Hash.number(Array.isArray(value) ? 1 : 2)
  if (depth === 0) return h
  for (const key of Object.keys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key)!
    h = Hash.combine(
      h,
      Hash.combine(
        Hash.string(key),
        "value" in property ? hashOf(property.value, depth - 1) : 0
      )
    )
  }
  return h
}

class Key implements Equal.Equal {
  readonly values: ReadonlyArray<unknown>
  constructor(values: ReadonlyArray<unknown>) {
    this.values = values
  }
  [Hash.symbol](): number {
    let h = Hash.number(this.values.length)
    for (const value of this.values) h = Hash.combine(h, hashOf(value, 6))
    return h
  }
  [Equal.symbol](that: unknown): boolean {
    return that instanceof Key && same(this.values, that.values)
  }
}

const count = (name: string, value: number, least: number): number => {
  if (!Number.isSafeInteger(value) || value < least) {
    throw new Error(
      `Story.explore: \`${name}\` must be an integer of at least ${least}, got ${value}`
    )
  }
  return value
}

/**
 * Searches every story of up to `options.depth` moves from `init`, running each move on a cursor
 * `at` makes, and throws the first failure with its steps.
 *
 * @internal
 */
export const explore = (
  site: Function,
  at: (state: State) => Story,
  component: Component.Any,
  props: unknown,
  options: ExploreOptions<any, ReadonlyArray<ExploredCommand>>
): Explored =>
  atSite(callSite(site), () => {
    const depth = count("depth", options.depth, 0)
    const budget = count("states", options.states ?? 10_000, 1)
    const lists = new Map(
      (options.commands ?? []).map((
        [definition, results]
      ) => [Command.nameOf(definition), results])
    )
    const checks = rules.make(component, options)
    const settled = new WeakMap<Issued, Settles | string>()
    let runs = 0

    /**
     * How a pending Command settles: with its `commands` entry, or `Component.noop` for a silent
     * Service. A string says why the search can't settle it.
     */
    const settlesOf = (command: Issued): Settles | string => {
      let out = settled.get(command)
      if (out !== undefined) return out
      const listed = lists.get(command.name)
      if (command._tag === "Stream") {
        out =
          `${command.name} is a stream Command, which explore doesn't settle`
      } else if (
        listed === undefined && !isNoopSchema(command.service?.success)
      ) {
        out =
          `${command.name} has no \`commands\` entry: list the results it settles with, or [] for none`
      } else {
        const success = listed === undefined
          ? [noop]
          : values(listed.success, command.args)
        const error = values(listed?.error, command.args)
        // Pending Commands are stored with their result types erased.
        const resolve = command.resolve as (value: unknown) => unknown
        const reject = command.reject as
          | ((value: unknown) => unknown)
          | undefined
        // A run that reads more than its result, an `afterRefetch` wait or an optimistic patch,
        // never merges with another, nor does one whose mapping throws: its settling step fails.
        let key: unknown = runs++
        if (
          command.afterRefetch === undefined && command.optimistic.length === 0
        ) {
          try {
            key = [
              ...success.map(resolve),
              ...error.map((value) => reject?.(value))
            ]
          } catch {
            // Report the mapper failure at settlement, not while building the key.
          }
        }
        out = { success, error, key }
      }
      settled.set(command, out)
      return out
    }

    /**
     * The values a later move can read of a record that passed `check`, in a flat list: the
     * containers around them are the search's and the engine's, so copies of them don't count as
     * copies of the record's data.
     */
    const keyOf = (state: State): Key => {
      const { loadingMore, pending, results } = state
      // Each list is preceded by its length, so two keys are equal only part by part.
      const values: Array<unknown> = [state.model]
      if (results === undefined) values.push(-1)
      else {
        const names = Object.keys(results)
        values.push(names.length)
        for (const name of names) values.push(name, results[name])
      }
      values.push(loadingMore.length, ...loadingMore, pending.length)
      for (const { awaiting, command, message, status } of pending) {
        values.push(command.name, command.args, status, message)
        if (awaiting === undefined) values.push(-1)
        else {
          values.push(awaiting.length)
          for (const query of awaiting) values.push(query.name, query.args)
        }
        const key = (settlesOf(command) as Settles).key
        if (Array.isArray(key)) values.push(key.length, ...key)
        else values.push("run", key)
      }
      return new Key(values)
    }

    /**
     * Hide interruption history and Command internals from the invariant because the key omits them.
     */
    const recordOf = (story: Story): object => {
      const { interrupted: _, pending: __, ...fields } = Object
        .getOwnPropertyDescriptors(story.current)
      const record = Object.defineProperties({
        pending: story.state.pending.map((entry) => ({
          ...entry,
          command: { name: entry.command.name, args: entry.command.args }
        }))
      }, fields)
      stateOf.set(record, story.state)
      return record
    }

    const fail = (problem: rules.Problem, node: Node, state: State): never => {
      const path: Array<ReadonlyArray<string>> = []
      for (let at: Node | undefined = node; at !== undefined; at = at.parent) {
        path.push(at.lines())
      }
      const [first, ...steps] = path.reverse().flat()
      throw new Error(
        `Story.explore: ${problem.reason}:\n\n${first}\n  ${
          steps.join("\n  ")
        }\n\n  ${
          [
            ...(problem.detail ?? []),
            `model: ${show(component.model, state.model)}`,
            `pending: ${engine.describePending(state.pending)}`
          ].join("\n  ")
        }`
      )
    }

    const visit = (
      parent: Node | undefined,
      story: Story,
      move: Move
    ): Node => {
      const acknowledged: Array<string> = []
      let problem: rules.Problem | undefined
      try {
        const updates = engine.recordUpdates(() => move.run(story))
        problem = rules.check(
          checks,
          story,
          updates,
          () => recordOf(story),
          acknowledged
        )
        if (problem === undefined) {
          const reason = story.state.pending.map((entry) =>
            settlesOf(entry.command)
          ).find((settles) => typeof settles === "string")
          if (reason !== undefined) problem = { reason }
        }
      } catch (error) {
        problem = { reason: `the step threw: ${rules.messageOf(error)}` }
      }
      const node: Node = {
        parent,
        lines: () => [...move.lines(), ...acknowledged]
      }
      return problem === undefined ? node : fail(problem, node, story.state)
    }

    /** Every move from a record, in a fixed order: the messages as listed, then pending work, oldest first. */
    const movesOf = (state: State): Array<Move> => {
      const blocked = engine.blocking(state)
      const commands = blocked.commands
      const queries = Array.from(
        new Set([
          ...blocked.more,
          ...blocked.queries.map((entry) => entry.name)
        ])
      )
      const moves: Array<Move> = values(options.messages, state.model).map((
        message
      ) => ({
        lines: () => [
          ...new Set(
            commands.map((entry) => `.keepPending(${entry.command.name})`)
          ),
          ...queries.map((name) => `.keepPending(${JSON.stringify(name)})`),
          `.send(${show(component.message, message)})`
        ],
        run: (story) => {
          for (const entry of commands) story.keepPending(entry.command)
          for (const name of queries) story.keepPending(name)
          story.send(message)
        }
      }))
      const settles = (entry: Pending<any>) =>
        entry.status === "running" || (entry.awaiting?.length ?? 0) > 0
      for (const entry of state.pending) {
        if (!settles(entry)) continue
        const command = entry.command
        const peers = state.pending.filter((other) =>
          other.status === entry.status && settles(other) &&
          other.command.name === command.name
        )
        // As with a written step, only the oldest run with the same name and args can settle.
        if (peers.find((other) => engine.matches(command, other)) !== entry) {
          continue
        }
        // A step names the oldest run by name, and a later one with its args.
        const target = () =>
          peers[0] === entry ? command.name : engine.describe(command)
        if (entry.status === "awaiting") {
          moves.push({
            lines: () => [`.waitExpired(${target()})`],
            run: (story) => story.waitExpired(command)
          })
          continue
        }
        const { error, success } = settlesOf(command) as Settles
        for (const value of success) {
          moves.push({
            lines: () => [
              `.resolve(${target()}, ${show(command.service?.success, value)})`
            ],
            run: (story) => story.resolve(command, value)
          })
        }
        for (const value of error) {
          moves.push({
            lines: () => [
              `.fail(${target()}, ${show(command.service?.error, value)})`
            ],
            run: (story) => story.fail(command, value)
          })
        }
      }
      return moves
    }

    const first = at(initial(component, props))
    const root = visit(undefined, first, {
      lines: () => [
        `Story.start(${component.definition.name}, ${
          show(component.props, props)
        })`
      ],
      run: () => {}
    })
    const seen = MutableHashSet.make(keyOf(first.state))
    let frontier: Array<readonly [Node, State]> = [[root, first.state]]
    for (let level = 1; level <= depth; level++) {
      const next: typeof frontier = []
      for (const [node, state] of frontier) {
        for (const move of movesOf(state)) {
          const story = at(state)
          const child = visit(node, story, move)
          const key = keyOf(story.state)
          if (MutableHashSet.has(seen, key)) continue
          if (MutableHashSet.size(seen) >= budget) {
            throw new Error(
              `Story.explore: the budget of ${budget} states ran out at depth ${level} of ${depth}, so nothing is claimed: raise \`states\` or lower \`depth\``
            )
          }
          MutableHashSet.add(seen, key)
          next.push([child, story.state])
        }
      }
      if (next.length === 0) {
        return { states: MutableHashSet.size(seen), closed: true }
      }
      frontier = next
    }
    return { states: MutableHashSet.size(seen), closed: false }
  })
