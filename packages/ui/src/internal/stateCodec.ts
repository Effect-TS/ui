import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import type * as Component from "../Component.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import { holdsRedacted } from "./schemaRedact.ts"

interface JsonCodec {
  readonly encode: (value: unknown) => Effect.Effect<unknown, SchemaIssue.Issue>
  readonly decode: (
    encoded: unknown
  ) => Effect.Effect<unknown, SchemaIssue.Issue>
}
const jsonCodecs = new WeakMap<object, JsonCodec>()
// A Schema with no JSON form, such as one with a symbol key, throws when its
// codec is built, which a suspended Schema defers until it parses that value.
const forbid = (defect: unknown) =>
  Effect.fail(new SchemaIssue.Forbidden({ message: String(defect) }))
/** @internal */
export const jsonCodecOf = (schema: Schema.Codec<any, any>): JsonCodec => {
  let found = jsonCodecs.get(schema)
  if (found === undefined) {
    let codec: Schema.Codec<unknown, unknown> | undefined
    const json = () =>
      codec ??= Schema.toCodecJson(schema as Schema.Codec<unknown, unknown>)
    const guarded = (
      make: () => (input: unknown) => Effect.Effect<unknown, SchemaIssue.Issue>
    ) => {
      let parse: ReturnType<typeof make> | undefined
      return (input: unknown) =>
        Effect.catchDefect(
          Effect.suspend(() => (parse ??= make())(input)),
          forbid
        )
    }
    found = {
      encode: guarded(() => SchemaParser.encodeUnknownEffect(json())),
      decode: guarded(() => SchemaParser.decodeUnknownEffect(json()))
    }
    jsonCodecs.set(schema, found)
  }
  return found
}

const stateCodecs = new WeakMap<object, StateCodec>()
interface StateCodec {
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
const failRedacted = Effect.fail(redactedIssue)
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

/** @internal */
export const forgetStateCodec = (component: Component.Any): void => {
  stateCodecs.delete(component)
}

/** @internal */
export const encodeJson = (
  schema: Schema.Codec<any, any>,
  value: unknown
): Effect.Effect<unknown, SchemaIssue.Issue> =>
  holdsRedacted(schema.ast) ? failRedacted : jsonCodecOf(schema).encode(value)

/** @internal */
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
  const reported = encodeJson(component.definition.message, last.message)
  return Effect.flatMapEager(
    state,
    (state) => Effect.mapEager(reported, (reported) => ({ state, reported }))
  )
}

/** @internal */
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
