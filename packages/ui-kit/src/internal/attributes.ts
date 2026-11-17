/**
 * Attributes a consumer passes for the elements a ui-kit component draws.
 *
 * @internal
 */
import * as Schema from "effect/Schema"

/**
 * The attributes a consumer passes for one element, by HTML name:
 * `{ class: "...", "aria-label": "..." }`.
 *
 * @internal
 */
export const Attributes = Schema.Record(Schema.String, Schema.String)

/** @internal */
export type Attributes = typeof Attributes.Type

// HTML attribute names are case-insensitive, so names are compared
// lowercased. A name is written only if it is a plain attribute name: no
// whitespace, quotes, `=`, `<`, `>` or `/`, which would end it early in
// server-rendered HTML. An `on*` attribute is an inline event handler, and
// the component owns the handlers on what it draws.
const plain = /^[a-z_:][-a-z0-9_.:]*$/
const handler = /^on/

/**
 * Writes the consumer's attributes onto a builder, then the component's own
 * over them. Consumer names are lowercased, and `on*` names and names that
 * aren't plain attribute names are dropped. A name in `owned` is the
 * component's whatever its value: an `undefined` there removes the
 * consumer's attribute.
 *
 * @internal
 */
export const withAttributes = <B extends { readonly attr: (name: string, value: string | undefined) => any }>(
  builder: B,
  consumer: Attributes | undefined,
  owned: Readonly<Record<string, string | undefined>>
): ReturnType<B["attr"]> => {
  let out: any = builder
  if (consumer !== undefined) {
    for (const key in consumer) {
      const name = key.toLowerCase()
      if (plain.test(name) && !handler.test(name)) out = out.attr(name, consumer[key])
    }
  }
  for (const name in owned) out = out.attr(name, owned[name])
  return out
}
