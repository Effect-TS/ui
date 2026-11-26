import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type {
  Noop,
  NoopSchema,
  NoopSchemaTypeId,
  NoopTypeId
} from "../Component.ts"

// The same strings as `Component.NoopTypeId` and `Component.NoopSchemaTypeId`. Declared here too so this
// module needs `Component.ts` for types only.
const TypeId: NoopTypeId = "~@effect/ui/Component/Noop"
const SchemaTypeId: NoopSchemaTypeId = "~@effect/ui/Component/NoopSchema"

/** @internal */
export const noop: Noop = Object.freeze({ [TypeId]: TypeId })

/**
 * Recognises the value by its type id, not by identity, so a copy made by another copy of `effect` in the
 * same bundle counts.
 *
 * @internal
 */
export const isNoop = (u: unknown): u is Noop =>
  Predicate.hasProperty(u, TypeId) && u[TypeId] === TypeId

/**
 * `Component.Noop`, here so `Command.Service` can default `success` to it.
 *
 * @internal
 */
export const noopSchema: NoopSchema = /* @__PURE__ */ Object.assign(
  /* @__PURE__ */ Schema.declare(isNoop, { identifier: "Component.Noop" }),
  { [SchemaTypeId]: SchemaTypeId } as const
)

/**
 * Checks the property `Component.NoopSchema` types, so the runtime silences exactly the Services whose body
 * may return anything.
 *
 * @internal
 */
export const isNoopSchema = (u: unknown): boolean =>
  Predicate.hasProperty(u, SchemaTypeId) && u[SchemaTypeId] === SchemaTypeId
