import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"
import { flag, visuallyHidden } from "./attributes.ts"

export interface FormField {
  readonly name?: string | undefined
  readonly form?: string | undefined
  readonly autoComplete?: string | undefined
  readonly required: boolean
  readonly readOnly: boolean
  readonly disabled: boolean
  readonly multiple: boolean
  readonly values: ReadonlyArray<string>
  readonly filled: boolean
}

export const valueSchema = <V extends string>(value: Schema.Codec<V, string>) =>
  Schema.NullOr(Schema.Union([value, Schema.Array(value)]))

export interface Valued<V extends string = string> {
  readonly value?: V | ReadonlyArray<V> | null | undefined
  readonly multiple?: boolean | undefined
}

export const valuesOf = <V extends string>(
  props: Valued<V>
): ReadonlyArray<V> =>
  props.value == null
    ? []
    : typeof props.value === "string"
    ? [props.value]
    : props.value

export const filledOf = (props: Valued): boolean =>
  props.multiple === true
    ? valuesOf(props).length > 0
    : valuesOf(props).some((value) => value !== "")

export const toggled = <V extends string>(
  values: ReadonlyArray<V>,
  value: V
): ReadonlyArray<V> =>
  values.includes(value)
    ? values.filter((other) => other !== value)
    : [...values, value]

export const autofillMatch = <
  A extends { readonly value: string; readonly label: string }
>(
  items: ReadonlyArray<A>,
  text: string
): A | undefined => {
  const lower = text.toLowerCase()
  return items.find((item) => item.value.toLowerCase() === lower) ??
    items.find((item) => item.label.toLowerCase() === lower)
}

export interface FormFieldMessages<Msg> {
  readonly focused: Msg
  readonly autofilled: (value: string) => Msg
}

export const input = () =>
  new Html.VoidElement<
    never,
    never,
    Html.EventsOf<"input">,
    HTMLInputElement,
    "input"
  >("input")

export const formInputs = <Msg>(
  p: Pick<Component.PartsHelper<Msg, unknown, Html.Elements>, "part">,
  field: FormField,
  messages: FormFieldMessages<Msg>
) => {
  const real = field.name !== undefined || field.required ||
    field.autoComplete !== undefined
  const main = p.part("input", (b) => {
    const value = field.multiple ? "" : (field.values[0] ?? "")
    return b
      .attrs({
        name: field.multiple ? undefined : field.name,
        form: field.form,
        value
      })
      .value(value)
      .disabled(field.disabled)
      .attrs({
        type: real ? "text" : "hidden",
        autocomplete: field.autoComplete,
        required: flag(field.required && !(field.multiple && field.filled)),
        readonly: flag(field.readOnly && real),
        tabindex: real ? "-1" : undefined,
        "aria-hidden": real ? "true" : undefined,
        style: real ? visuallyHidden : undefined
      })
      .on("focus", messages.focused)
      .on("change", ({ value }) => messages.autofilled(value))
  })
  const each = p.part("input", (b, value: string) =>
    b.attrs({
      type: "hidden",
      name: field.name,
      form: field.form,
      value
    })
      .value(value)
      .disabled(field.disabled))
  return [
    ...(field.form !== undefined || real ? [main(input())] : []),
    ...(field.multiple && field.name !== undefined
      ? field.values.map((value) => each(input().key(value), value))
      : [])
  ]
}
