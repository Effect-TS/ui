import * as View from "@effect/ui/View"
import type { Keyed } from "./attributes.ts"

export const keyed = <
  Tag extends string,
  Rest extends ReadonlyArray<unknown>,
  R
>(
  part: View.Part<Tag, [value: string, ...Rest], R>
) =>
  View.wrapPart(
    part,
    <
      B extends View.PartTarget<Tag> & {
        readonly key: (key: string) => View.PartTarget<Tag>
      }
    >(
      element: B,
      value: string,
      ...rest: Rest
    ): ReturnType<B["attr"]> => part(element.key(value), value, ...rest)
  )

export const valued = <Tag extends string, R>(
  part: View.Part<Tag, [value: string], R>
) =>
  View.wrapPart(
    part,
    <B extends Keyed<Tag>>(
      { element, value }: { readonly element: B; readonly value: string }
    ): ReturnType<B["attr"]> => part(element.key(value), value)
  )

export const grouped = <Tag extends string, R>(
  part: View.Part<Tag, [group: string], R>
) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag>>(
      { element, group }: { readonly element: B; readonly group: string }
    ): ReturnType<B["attr"]> => part(element, group)
  )
