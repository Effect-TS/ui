import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"

// The props of a control that submits one value when on and another, or
// nothing, when off.
interface FieldProps {
  readonly checked: boolean
  readonly disabled?: boolean | undefined
  readonly name?: string | undefined
  readonly value?: string | undefined
  readonly uncheckedValue?: string | undefined
}

// What the form submits for these props, or nothing, like a checkbox: an off
// control without an `uncheckedValue` and a disabled one submit nothing.
const submitted = (props: FieldProps): string | undefined =>
  props.name === undefined || props.disabled === true
    ? undefined
    : props.checked
    ? (props.value ?? "on")
    : props.uncheckedValue

// The hidden input inside the root. A hidden input isn't interactive
// content, so it may sit inside a <button>, and a form still submits it.
export const field = (props: FieldProps): View.Node<never> | undefined => {
  const value = submitted(props)
  return value === undefined
    ? undefined
    : View.toNode(
      new Html.VoidElement<never>("input")
        .attrs({
          type: "hidden",
          name: props.name,
          value
        })
    )
}

// The control without that input, for a control something else disabled
// after it read its own props, such as a field.
export const withoutField = <Msg, R>(control: View.Element<Msg, R>): View.Element<Msg, R> => ({
  ...control,
  children: control.children.filter((node) =>
    !(node._tag === "Element" && node.tag === "input" && node.attrs.type === "hidden")
  )
})
