import * as View from "@effect/ui/View"

export interface Labelled {
  readonly label: string
  readonly disabled?: boolean | undefined
}

export const available = (item: Labelled | undefined): boolean => item !== undefined && item.disabled !== true

export const keyed = <Tag extends string, Rest extends ReadonlyArray<unknown>, R>(
  part: View.Part<Tag, [value: string, ...Rest], R>
) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag> & { readonly key: (key: string) => View.PartTarget<Tag> }>(
      element: B,
      value: string,
      ...rest: Rest
    ): ReturnType<B["attr"]> => part(element.key(value), value, ...rest)
  )

export type Loop = "none" | "wrap" | "escape"

export const stepped = (at: number, last: number, direction: 1 | -1, loop: Loop): number => {
  if (last < 0) return -1
  if (at === -1) return direction === 1 ? 0 : last
  const next = at + direction
  if (next >= 0 && next <= last) return next
  return loop === "none" ? at : loop === "escape" ? -1 : direction === 1 ? 0 : last
}
