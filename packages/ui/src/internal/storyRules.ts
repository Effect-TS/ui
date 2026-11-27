/**
 * The checks `Story.check` and `Story.explore` run after each step.
 *
 * @internal
 */
import * as Schema from "effect/Schema"
import type * as Component from "../Component.ts"
import type { Transition } from "../testing/Story.ts"
import type { Cursor } from "./steps.ts"
import * as engine from "./story.ts"

type Update = Transition<unknown, unknown>

/** @internal */
export interface Rules {
  /** The component to start stories from: with a `transition` rule, one that records its `update` calls. */
  readonly component: Component.Any
  readonly updates: Array<Update>
  readonly isModel: (u: unknown) => boolean
  readonly isEvent: (u: unknown) => boolean
  readonly transition: ((update: Update) => boolean | void) | undefined
  readonly invariant: ((record: any) => boolean | void) | undefined
}

/** @internal */
export const make = (
  component: Component.Any,
  options: {
    readonly transition?: ((update: any) => boolean | void) | undefined
    readonly invariant?: ((record: any) => boolean | void) | undefined
  }
): Rules => {
  const updates: Array<Update> = []
  const { transition } = options
  return {
    // Another story started during a step runs its own component, so it isn't recorded.
    component: transition === undefined
      ? component
      // Defined, not assigned: assignment can't shadow a frozen component's `update`.
      : Object.create(component, {
        update: {
          value: (model: unknown, message: unknown, ...rest: Array<any>) => {
            const next = (component.update as Function)(model, message, ...rest)
            updates.push({ before: model, message, after: next.model })
            return next
          }
        }
      }),
    updates,
    isModel: Schema.is(component.model as Schema.Codec<unknown, unknown>),
    isEvent: Schema.is(component.events as Schema.Codec<unknown, unknown>),
    transition,
    invariant: options.invariant
  }
}

/**
 * Why a step failed, and the lines a report prints before the Model: the failing `update` call.
 *
 * @internal
 */
export interface Problem {
  readonly reason: string
  readonly detail?: ReadonlyArray<string> | undefined
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const run = (name: string, f: () => boolean | void): string | undefined => {
  try {
    return f() === false ? `the ${name} returned false` : undefined
  } catch (error) {
    return `the ${name} threw: ${messageOf(error)}`
  }
}

type Story = Cursor & {
  emitted(...events: Array<unknown>): unknown
  sent(owner: Component.Send["owner"], message: unknown): unknown
}

/**
 * Runs `f`, then checks the Model's Schema, `transition` on each `update` call `f` made,
 * `invariant` on `record`, then validates and acknowledges events and sends, adding their steps to
 * `lines`, then `after`. The invariant runs before acknowledging so it can inspect events and sends.
 *
 * @internal
 */
export const step = (
  rules: Rules,
  story: Story,
  f: () => void,
  record: () => unknown,
  lines: Array<string>,
  after?: () => string | undefined
): Problem | undefined => {
  rules.updates.length = 0
  try {
    f()
    const problem = check(rules, story, record, lines)
    if (problem !== undefined) return problem
    const reason = after?.()
    return reason === undefined ? undefined : { reason }
  } catch (error) {
    return { reason: `the step threw: ${messageOf(error)}` }
  }
}

/**
 * The end of a report: the failing `update` call, if any, then the Model and what's pending.
 *
 * @internal
 */
export const describe = (
  problem: Problem,
  state: engine.State<any, any, any, any>
): string =>
  [
    ...(problem.detail ?? []),
    `model: ${engine.show(state.component.model, state.model)}`,
    `pending: ${engine.describePending(state.pending)}`
  ].join("\n  ")

const check = (
  rules: Rules,
  story: Story,
  record: () => unknown,
  lines: Array<string>
): Problem | undefined => {
  const state = story.state
  const component = state.component
  if (!rules.isModel(state.model)) {
    return { reason: "the Model doesn't satisfy its Schema" }
  }
  const { invariant, transition } = rules
  if (transition !== undefined) {
    for (const update of rules.updates) {
      const reason = run("transition rule", () => transition(update))
      if (reason !== undefined) {
        return {
          reason,
          detail: [
            `update: ${engine.show(component.message, update.message)}`,
            `  before: ${engine.show(component.model, update.before)}`,
            `  after: ${engine.show(component.model, update.after)}`
          ]
        }
      }
    }
  }
  if (invariant !== undefined) {
    const reason = run("invariant", () => invariant(record()))
    if (reason !== undefined) return { reason }
  }
  const events: Schema.Top = component.events
  for (const event of state.emitted) {
    if (!rules.isEvent(event)) {
      return {
        reason: `the event ${
          engine.show(events, event)
        } doesn't satisfy the events Schema`
      }
    }
  }
  if (state.emitted.length > 0) {
    lines.push(
      `.emitted(${
        state.emitted.map((event) => engine.show(events, event)).join(", ")
      })`
    )
    story.emitted(...state.emitted)
  }
  for (const send of state.sent) {
    const receives = send.owner.receives as Schema.Codec<unknown, unknown>
    const shown = engine.show(receives, send.message)
    if (!Schema.is(receives)(send.message)) {
      return {
        reason:
          `the send ${shown} doesn't satisfy the receives Schema of ${send.owner.definition.name}`
      }
    }
    lines.push(`.sent(${send.owner.definition.name}, ${shown})`)
    story.sent(send.owner, send.message)
  }
  return undefined
}
