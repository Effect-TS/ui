/**
 * Schemas for UI values that are built often and must stay cheap to build.
 *
 * `TaggedEnum` takes the same input as `Schema.TaggedUnion` and attaches one
 * constructor per case, plus `is` and `match`, directly to the schema, the
 * way `Data.taggedEnum` does. The constructors skip validation, so a model or
 * message built in a hot path costs no more than an object literal, while the
 * same definition still decodes and encodes as a schema.
 *
 * **Example** (A message union with direct constructors)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   Increment: { by: Schema.Number },
 *   Reset: {}
 * })
 *
 * Message.Increment({ by: 1 }) // => { by: 1, _tag: "Increment" }
 * Message.Reset() // => { _tag: "Reset" }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type * as Types from "effect/Types"

/**
 * A `Schema.TaggedUnion` with one unchecked constructor per case, `is` and
 * `match`.
 *
 * **Details**
 *
 * The schema members come from {@link TaggedEnum.Base} and the constructors from
 * {@link TaggedEnum.Constructors}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TaggedEnum<Cases extends Record<string, Schema.Constraint>> =
  & TaggedEnum.Base<Cases>
  & TaggedEnum.Constructors<Cases>

/**
 * Types that make up a {@link TaggedEnum}.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace TaggedEnum {
  /**
   * The schema members of a {@link TaggedEnum}, without the constructors.
   *
   * **Details**
   *
   * Everything `Schema.TaggedUnion` has, including `cases`, `guards` and
   * `match`, plus `is`. `annotate`, `check` and `rebuild`
   * return a {@link TaggedEnum}, so the constructors survive them.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export interface Base<Cases extends Record<string, Schema.Constraint>> extends Schema.TaggedUnion<Cases> {
    readonly "Rebuild": TaggedEnum<Cases>
    /**
     * Returns a type guard that checks only the `_tag` field.
     */
    readonly is: <Tag extends keyof Cases>(tag: Tag) => (u: unknown) => u is Cases[Tag]["Type"]
  }

  /**
   * One constructor per case, keyed by tag.
   *
   * **Details**
   *
   * A constructor takes the case's `Type` without `_tag`, or no argument when
   * the case has no other fields, and returns it with `_tag` added.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Constructors<Cases extends Record<string, Schema.Constraint>> = {
    readonly [K in keyof Cases]: (
      args: Types.VoidIfEmpty<
        { readonly [P in keyof Cases[K]["Type"] as P extends "_tag" ? never : P]: Cases[K]["Type"][P] }
      >
    ) => Cases[K]["Type"]
  }

  /**
   * Keys that can't be tags because they collide with schema, function or
   * object members.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type ReservedTag =
    | Extract<keyof Base<{}> | keyof Function, string>
    | "constructor"
    | "hasOwnProperty"
    | "isPrototypeOf"
    | "propertyIsEnumerable"
    | "toLocaleString"
    | "valueOf"
    | "__proto__"
    | "__defineGetter__"
    | "__defineSetter__"
    | "__lookupGetter__"
    | "__lookupSetter__"
}

type TagOf<K> = K extends number ? `${K}` : Extract<K, string>

/**
 * Builds a `Schema.TaggedUnion` and attaches one unchecked constructor per
 * case, plus `is` and `match`, directly to the schema.
 *
 * **When to use**
 *
 * Use when models or messages are built in hot paths from trusted values and
 * the same definition must still decode and encode as a schema.
 *
 * **Details**
 *
 * Each constructor is keyed by its tag and only adds `_tag` to its input, like
 * `Data.taggedEnum`. The input is the case's `Type` without `_tag`; a case
 * with no other fields takes no argument. `is(tag)` returns a guard that
 * checks only `_tag`, and `match` matches exhaustively, data-first or
 * data-last. The `Schema.TaggedUnion` members, `cases` included, are kept,
 * and `annotate` returns a schema that still has the constructors.
 *
 * **Gotchas**
 *
 * - Constructors skip validation, checks and constructor defaults. A field
 *   with a constructor default is required, and a branded field takes a
 *   branded value. Use `cases[tag].make` when you need validation or defaults.
 * - `is(tag)` doesn't look past `_tag`. Decode untrusted input first.
 * - A tag in {@link TaggedEnum.ReservedTag} (`ast`, `annotate`, `cases`,
 *   `is`, `match`, `make`, `pipe`, `name`, `Type`, ...) is a type error.
 * - A case can't declare its own `_tag` field, because the case key is the
 *   tag. This is a type error, and throws when the schema is built.
 * - A numeric key becomes a string tag: `{ 1: {} }` has the tag `"1"`.
 *
 * **Example** (Building, matching and decoding)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Shape = UiSchema.TaggedEnum({
 *   Circle: { radius: Schema.Number },
 *   Rect: { width: Schema.Number, height: Schema.Number }
 * })
 *
 * const circle = Shape.Circle({ radius: 1 })
 *
 * Shape.is("Circle")(circle) // => true
 *
 * Shape.match(circle, {
 *   Circle: ({ radius }) => radius,
 *   Rect: ({ width, height }) => width * height
 * }) // => 1
 *
 * Schema.decodeUnknownSync(Shape)({ _tag: "Rect", width: 2, height: 3 }) // => { _tag: "Rect", width: 2, height: 3 }
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const TaggedEnum = <const CasesByTag extends Record<string, Schema.Struct.Fields>>(
  casesByTag:
    & CasesByTag
    & {
      readonly [K in keyof CasesByTag]: K extends TaggedEnum.ReservedTag ? never : { readonly _tag?: never }
    }
): TaggedEnum<{ readonly [K in keyof CasesByTag as TagOf<K>]: Schema.TaggedStruct<TagOf<K>, CasesByTag[K]> }> => {
  const tags = Object.keys(casesByTag)
  for (const key of tags) {
    if (Object.hasOwn(casesByTag[key], "_tag")) {
      throw new Error(`Case ${key} can't declare _tag`)
    }
  }
  const union = Schema.TaggedUnion(casesByTag)
  const { tag, cases, isAnyOf, guards, match, matchOrElse } = union
  const members: Record<string, unknown> = { tag, cases, isAnyOf, guards, match, matchOrElse, is }
  for (const key of tags) {
    members[key] = (args: object | undefined) => ({ ...args, _tag: key })
  }
  return Schema.make<any>(union.ast, members)
}

const is = (tag: string) => (u: unknown) => Predicate.isTagged(u, tag)
