/**
 * An instance's state as JSON, for page state and history restore.
 *
 * @internal
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import type * as Component from "../Component.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import { holdsRedacted } from "./schemaRedact.ts"

/**
 * A Schema as JSON.
 *
 * @internal
 */
export interface JsonCodec {
  readonly encode: (value: unknown) => Effect.Effect<unknown, SchemaIssue.Issue>
  readonly decode: (
    encoded: unknown
  ) => Effect.Effect<unknown, SchemaIssue.Issue>
}
const jsonCodecs = new WeakMap<object, JsonCodec>()
/** @internal */
export const jsonCodecOf = (schema: Schema.Codec<any, any>): JsonCodec => {
  let found = jsonCodecs.get(schema)
  if (found === undefined) {
    const codec = Schema.toCodecJson(schema as Schema.Codec<unknown, unknown>)
    found = {
      encode: SchemaParser.encodeUnknownEffect(codec),
      decode: SchemaParser.decodeUnknownEffect(codec)
    }
    jsonCodecs.set(schema, found)
  }
  return found
}

/**
 * An instance's state as JSON, for page state and history restore: its Model, and for a component
 * with queries, `{ model, queries }` with the query results.
 *
 * A state whose Schema holds a `Schema.Redacted` anywhere is never serialised: JSON would hold the
 * secret. Its codec encodes and decodes nothing, so the server defers the instance and history keeps
 * no entry for it, and state an older build wrote isn't adopted either.
 */
const stateCodecs = new WeakMap<object, StateCodec>()
/** @internal */
export interface StateCodec {
  readonly redacted: boolean
  readonly encode: (
    model: unknown,
    results: componentQueries.Results | undefined
  ) => Effect.Effect<unknown, SchemaIssue.Issue>
  readonly decode: (
    encoded: unknown
  ) => Effect.Effect<Decoded, SchemaIssue.Issue>
}
/** @internal */
export interface Decoded {
  readonly model: unknown
  readonly results: componentQueries.Results | undefined
}
/** @internal */
export const redactedIssue = new SchemaIssue.Forbidden({
  message: "the Schema holds a Schema.Redacted"
})
/** @internal */
export const failRedacted = Effect.fail(redactedIssue)
const redactedState: StateCodec = {
  redacted: true,
  encode: () => failRedacted,
  decode: () => failRedacted
}
/** @internal */
export const stateCodecOf = (component: Component.Any): StateCodec => {
  let found = stateCodecs.get(component)
  if (found === undefined) {
    const schema =
      (component as Component.Component<any, any, any, any, any, any, any>)
        .model
    const bound = queryCore.boundOf(component)
    if (
      holdsRedacted(schema.ast) ||
      (bound !== undefined && holdsRedacted(bound.schema.ast))
    ) {
      found = redactedState
    } else if (bound === undefined) {
      const codec = jsonCodecOf(schema)
      found = {
        redacted: false,
        encode: (model) => codec.encode(model),
        decode: (encoded) =>
          Effect.mapEager(
            codec.decode(encoded),
            (model) => ({ model, results: undefined })
          )
      }
    } else {
      const codec = jsonCodecOf(
        Schema.Struct({ model: schema, queries: bound.schema })
      )
      found = {
        redacted: false,
        encode: (model, results) =>
          codec.encode({ model, queries: results ?? bound.empty }),
        decode: (encoded) =>
          Effect.mapEager(
            codec.decode(encoded),
            (state: any) => ({ model: state.model, results: state.queries })
          )
      }
    }
    stateCodecs.set(component, found)
  }
  return found
}

/**
 * An instance's page state: its state, and for an owner whose reports sent a message the last one, which
 * the instance that takes the state compares its reports with. An owner whose message can't be shipped
 * isn't saved, as one built from its state alone would get that message again.
 *
 * @internal
 */
export const encodePage = (
  component: Component.Any,
  model: unknown,
  results: unknown,
  owning: unknown
): Effect.Effect<
  { readonly state: unknown; readonly reported: unknown },
  SchemaIssue.Issue
> => {
  const state = stateCodecOf(component).encode(model, results as never)
  const last = (owning as { collected?: { message: unknown } } | undefined)
    ?.collected
  if (last === undefined) {
    return Effect.mapEager(state, (state) => ({ state, reported: undefined }))
  }
  const message = component.definition.message
  const reported = holdsRedacted(message.ast)
    ? failRedacted
    : jsonCodecOf(message).encode(last.message)
  return Effect.flatMapEager(
    state,
    (state) => Effect.mapEager(reported, (reported) => ({ state, reported }))
  )
}

/**
 * What an owner taking saved state is given of its reports' last message: `held` until hydration has
 * adopted everything below it. `undefined` for no message, or one that doesn't decode.
 *
 * @internal
 */
export const reportedOf = (
  component: Component.Any,
  reported: unknown,
  held: boolean
):
  | {
    readonly collected: { readonly message: unknown }
    readonly held: boolean
  }
  | undefined =>
{
  if (reported === undefined || component.definition.collects === undefined) {
    return undefined
  }
  const exit = Effect.runSyncExit(
    jsonCodecOf(component.definition.message).decode(reported)
  )
  return exit._tag === "Success"
    ? { collected: { message: exit.value }, held }
    : undefined
}
