/**
 * Functions over plain structs, such as a Model or a struct inside one.
 *
 * `evolve` changes some fields of a struct and keeps the rest, with the
 * same field rules as `$.evolve` on a step: each field takes its new value
 * or a function from its old value to the new one, and can't change type.
 *
 * **Example** (A row of a list and a nested struct)
 *
 * ```ts import.meta.vitest
 * import { UiStruct } from "@effect/ui"
 *
 * const line = { id: "a", quantity: 1 }
 * UiStruct.evolve(line, { quantity: (n) => n + 1 }) // => { id: "a", quantity: 2 }
 *
 * type Coupon = { readonly code: string; readonly status: "Idle" | "Applied" }
 * const reset = UiStruct.evolve<Coupon>({ status: "Idle" })
 * reset({ code: "TEN", status: "Applied" }) // => { code: "TEN", status: "Idle" }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import { dual } from "effect/Function"
import type * as Types from "effect/Types"

/**
 * The fields `evolve` takes for a struct `S`: each one optional, as its new
 * value or a function from its old value to the new one.
 *
 * **Details**
 *
 * A function is always the updater, so a field that may hold a function,
 * an optional callback included, is `never` here and can't be set through
 * `evolve`. A function doesn't belong in a Model anyway, since it can't be
 * encoded for hydration or history.
 *
 * It is an error message instead when `S` is a union, nullable structs and
 * overlapping members included (match the union first, then evolve the
 * member), an array, a primitive or function, or unknown, as for a
 * data-last `evolve` with nowhere to take its type from.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type EvolveFields<S> = unknown extends S ? "evolve needs the struct's type: write evolve<Model>(...)"
  : Types.IsUnion<S> extends true ? "evolve takes one struct: match the union first"
  : S extends ReadonlyArray<unknown> ? "evolve takes a struct, not an array"
  : S extends (...args: any) => any ? "evolve takes a struct"
  : S extends object ? [keyof S] extends [never] ? "evolve takes a struct with fields"
    : { readonly [K in keyof S]?: EvolveField<S[K]> }
  : "evolve takes a struct"

// A field that may hold a function, optional callbacks included, can't be
// told from an updater.
type EvolveField<A> = 0 extends 1 & A ? any
  : [Extract<A, (...args: any) => any>] extends [never] ? A | ((value: A) => A)
  : never

const applyFields = (self: any, fields: Record<PropertyKey, unknown>) => {
  let out = self
  for (const key of Reflect.ownKeys(fields)) {
    const field = fields[key]
    const previous = self[key]
    const value = typeof field === "function" ? field(previous) : field
    if (!Object.is(value, previous)) {
      if (out === self) out = { ...self }
      out[key] = value
    }
  }
  return out
}

/**
 * Changes some fields of a struct and keeps the rest. Each field takes its
 * new value, or a function from its old value to the new one.
 *
 * **When to use**
 *
 * Use to change a struct inside the Model, such as a row of a list or a
 * nested struct field, or the Model in a handler that returns a bare Model.
 * For the Model itself in a step, `$.evolve` has the same rules.
 *
 * **Details**
 *
 * Unlike `Struct.evolve` from `effect`, a field can't change type: a value
 * or a function's result of the wrong type is an error on that field. A
 * field takes a whole value, so a partial struct isn't merged: write
 * `coupon: UiStruct.evolve({ status: "Idle" })` and not
 * `coupon: { status: "Idle" }`.
 *
 * An unknown key is an error when it's written in the fields literal.
 * TypeScript doesn't check the keys of an object built elsewhere and passed
 * in, so a misspelt key there is copied onto the result. Check fields
 * declared on their own where they're declared, which also types the
 * updaters: `const bump = { count: (n) => n + 1 } satisfies UiStruct.EvolveFields<Model>`.
 *
 * A function is always the updater. A union is an error, nullable structs
 * included: match it first, with `match` on a `UiSchema.TaggedEnum`, then
 * evolve the member. The data-last form takes the struct's type from where
 * it's written, so `Auth.match(model, { LoggedIn: UiStruct.evolve({ name }) })`
 * needs no annotation. Where nothing gives it one, pass the type:
 * `UiStruct.evolve<Coupon>({ status: "Idle" })`.
 *
 * The result is a plain-object shallow copy with the changed fields, or
 * the same struct when every field keeps its value. It is for plain
 * structs, not `Schema.Class` or other class instances: evolving a
 * changed field on a class instance compiles, but drops the prototype so
 * class methods are missing at runtime. For a class Model, use `$.set` with
 * a constructor or method that returns a valid instance.
 *
 * **Example** (A row of a list and a nested struct)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema, UiStruct } from "@effect/ui"
 * import { Array as Arr, Schema } from "effect"
 *
 * const Line = Schema.Struct({ id: Schema.String, quantity: Schema.Number })
 * const Coupon = Schema.Struct({ code: Schema.String, status: Schema.Literals(["Idle", "Applied"]) })
 * const Message = UiSchema.TaggedEnum({ ClickedIncrement: { id: Schema.String } })
 *
 * const Basket = Component.define({
 *   name: "Basket",
 *   scoped: false,
 *   model: Schema.Struct({ lines: Schema.Array(Line), coupon: Coupon, notice: Schema.NullOr(Schema.String) }),
 *   message: Message
 * }).make({
 *   init: ($) => $.set({ lines: [{ id: "a", quantity: 1 }], coupon: { code: "TEN", status: "Applied" }, notice: null }),
 *   update: {
 *     ClickedIncrement: ($, { id }) =>
 *       $.evolve({
 *         // A function of the old value, data-first for one row.
 *         lines: Arr.map((line) => line.id === id ? UiStruct.evolve(line, { quantity: (n) => n + 1 }) : line),
 *         // Data-last: the coupon's type comes from the field.
 *         coupon: UiStruct.evolve({ status: "Idle" }),
 *         // A plain value.
 *         notice: null
 *       })
 *   },
 *   view: (h, model) => h.el("p", `${model.lines.length} lines`)
 * })
 * ```
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const evolve: {
  <S>(fields: NoInfer<EvolveFields<S>>): (self: S) => S
  <S>(self: S, fields: NoInfer<EvolveFields<S>>): S
} = dual(2, applyFields)
