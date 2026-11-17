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

// An `on*` attribute is an inline event handler, and the component owns the
// handlers on what it draws.
const handler = /^on/i

/**
 * Writes the consumer's attributes onto a builder, then the component's own
 * over them. A name in `owned` is the component's whatever its value: an
 * `undefined` there removes the consumer's attribute. `on*` attributes are
 * dropped.
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
    for (const name in consumer) {
      if (!handler.test(name)) out = out.attr(name, consumer[name])
    }
  }
  for (const name in owned) out = out.attr(name, owned[name])
  return out
}
