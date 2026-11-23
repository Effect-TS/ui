import * as View from "@effect/ui/View"
import * as Schema from "effect/Schema"
import type { Keyed } from "./attributes.ts"

export interface Labelled {
  readonly label: string
  readonly disabled?: boolean | undefined
}

export const available = <A extends { readonly disabled?: boolean | undefined }>(item: A | undefined): item is A =>
  item !== undefined && item.disabled !== true

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

export const valued = <Tag extends string, R>(part: View.Part<Tag, [value: string], R>) =>
  View.wrapPart(
    part,
    <B extends Keyed<Tag>>(
      { element, value }: { readonly element: B; readonly value: string }
    ): ReturnType<B["attr"]> => part(element.key(value), value)
  )

export const grouped = <Tag extends string, R>(part: View.Part<Tag, [group: string], R>) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag>>(
      { element, group }: { readonly element: B; readonly group: string }
    ): ReturnType<B["attr"]> => part(element, group)
  )

export type Loop = "none" | "wrap" | "escape"

export const stepped = (at: number, last: number, direction: 1 | -1, loop: Loop): number => {
  if (last < 0) return -1
  if (at === -1) return direction === 1 ? 0 : last
  const next = at + direction
  if (next >= 0 && next <= last) return next
  return loop === "none" ? at : loop === "escape" ? -1 : direction === 1 ? 0 : last
}

export const Orientation = Schema.Literals(["horizontal", "vertical"])

export type Orientation = typeof Orientation.Type

export const arrowKeys = (orientation: Orientation, rtl: boolean) =>
  orientation === "vertical"
    ? { next: "ArrowDown", previous: "ArrowUp" }
    : { next: rtl ? "ArrowLeft" : "ArrowRight", previous: rtl ? "ArrowRight" : "ArrowLeft" }
