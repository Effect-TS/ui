/** @internal */
import * as scene from "../../internal/scene.ts"
import * as Locator from "../../testing/Locator.ts"
import type * as Html from "../Html.ts"
import * as HtmlLocator from "../testing/HtmlLocator.ts"
import { nonTextInputTypes } from "./editable.ts"

const lower = (value: string | undefined) => value?.toLowerCase()

const inputType = (node: Locator.Node): string =>
  lower(typeof node.props?.type === "string" ? node.props.type : node.attrs?.type) ?? "text"

/** An attribute set, or a property set to `true`. */
const flag = (node: Locator.Node, name: string): boolean =>
  node.props?.[name] === true || (node.props?.[name] === undefined && node.attrs?.[name] !== undefined)

const isEditable = (path: ReadonlyArray<Locator.Node>): boolean => {
  const tag = path[0]?.tag
  if (tag === "textarea" || tag === "select") return true
  if (tag === "input") return !nonTextInputTypes.has(inputType(path[0]!))
  for (const at of path) {
    const set = at.props?.contentEditable
    const value = lower(typeof set === "string" ? set : at.attrs?.contenteditable)
    if (value === "" || value === "true" || value === "plaintext-only") return true
    if (value === "false") return false
  }
  return false
}

const controls: ReadonlySet<string> = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "fieldset",
  "optgroup",
  "option"
])

/**
 * Whether `node`, with its ancestors innermost first in `path`, is disabled
 * as the browser sees it: a disabled control, or a control inside a disabled
 * `fieldset` other than in its first `legend`.
 *
 * @internal
 */
export const isDisabled = (node: Locator.Node, path: ReadonlyArray<Locator.Node> = []): boolean => {
  if (node.tag !== undefined && controls.has(node.tag) && flag(node, "disabled")) return true
  if (node.tag === undefined || !controls.has(node.tag) || node.tag === "fieldset") return false
  let previous: Locator.Node = node
  for (const ancestor of path) {
    if (ancestor === node) continue
    if (ancestor.tag === "fieldset" && flag(ancestor, "disabled")) {
      const legend = (ancestor.children ?? []).find((child) => child.tag === "legend")
      if (legend === undefined || legend !== previous) return true
    }
    previous = ancestor
  }
  return false
}

/** The button or input that submits its form when clicked, among `node` and its ancestors. */
const submitterIn = (path: ReadonlyArray<Locator.Node>): Locator.Node | undefined =>
  path.find((node) =>
    (node.tag === "button" && (lower(node.attrs?.type) ?? "submit") === "submit") ||
    (node.tag === "input" && (inputType(node) === "submit" || inputType(node) === "image"))
  )

const fieldValue = (node: Locator.Node): string => HtmlLocator.value(node) ?? ""

const selectValues = (select: Locator.Node): ReadonlyArray<string> => {
  const set = select.props?.value
  const options = Locator.elements(select).filter((node) => node.tag === "option" && !flag(node, "disabled"))
  const valueOf = (option: Locator.Node) => option.attrs?.value ?? Locator.textOf(option).trim()
  if (typeof set === "string") return options.some((option) => valueOf(option) === set) ? [set] : []
  const selected = options.filter((option) => flag(option, "selected"))
  if (selected.length > 0) return (flag(select, "multiple") ? selected : selected.slice(-1)).map(valueOf)
  return flag(select, "multiple") || options.length === 0 ? [] : [valueOf(options[0]!)]
}

/**
 * The form a control in `root` belongs to, with its ancestors innermost
 * first in `path`: the element its `form` attribute names by id when that
 * is a form, else none, and without one its nearest form ancestor.
 */
const ownerOf = (root: Locator.Node, path: ReadonlyArray<Locator.Node>): Locator.Node | undefined => {
  const id = path[0]?.attrs?.form
  if (id === undefined) return path.slice(1).find((node) => node.tag === "form")
  const named = Locator.elements(root).find((node) => node.attrs?.id === id)
  return named?.tag === "form" ? named : undefined
}

/**
 * The fields of `form` as `BrowserHost` reads them through `FormData`:
 * named, enabled fields whose form owner is `form`, in document order, a
 * checkbox or radio button only when checked, buttons only as the
 * submitter, and no files. A field outside the form that names it with its
 * `form` attribute is included, and one inside it that names another form
 * isn't.
 *
 * @internal
 */
export const formFields = (
  root: Locator.Node,
  form: Locator.Node,
  submitter: Locator.Node | undefined
): Html.SubmitPayload => {
  const fields: Record<string, string> = Object.create(null)
  const entries: Array<readonly [string, string]> = []
  const add = (name: string, value: string) => {
    entries.push([name, value])
    if (!Object.hasOwn(fields, name)) fields[name] = value
  }
  const walk = (node: Locator.Node, path: ReadonlyArray<Locator.Node>) => {
    const name = node.attrs?.name
    if (
      node.tag !== undefined && name !== undefined && name !== "" && ownerOf(root, path) === form &&
      !isDisabled(node, path)
    ) {
      switch (node.tag) {
        case "button":
          if (node === submitter) add(name, fieldValue(node))
          break
        case "input": {
          const type = inputType(node)
          if (type === "submit" || type === "image" || type === "button" || type === "reset") {
            if (node === submitter && type === "submit") add(name, fieldValue(node))
          } else if (type === "checkbox" || type === "radio") {
            if (HtmlLocator.checked(node) === true) add(name, HtmlLocator.value(node) ?? "on")
          } else if (type !== "file") {
            add(name, fieldValue(node))
          }
          break
        }
        case "select":
          for (const value of selectValues(node)) add(name, value)
          break
        case "textarea":
          add(name, typeof node.props?.value === "string" ? node.props.value : Locator.textOf(node))
          break
      }
    }
    for (const child of node.children ?? []) walk(child, [child, ...path])
  }
  walk(root, [root])
  return { fields, entries }
}

/**
 * The payload of the `toggle` a `popovertarget` button sends its popover, or `undefined` when the
 * click leaves the popover as it is.
 */
const popoverToggle = (button: Locator.Node, popover: Locator.Node): Html.PopoverTogglePayload | undefined => {
  const open = HtmlLocator.popoverState(popover) === "open"
  const action = lower(button.attrs?.popovertargetaction) ?? "toggle"
  const next = action === "show" ? true : action === "hide" ? false : !open
  if (next === open) return undefined
  return { open: next, newState: next ? "open" : "closed", oldState: open ? "open" : "closed" }
}

/**
 * The form `path[0]` submits: itself when it is a form, else its form owner.
 *
 * @internal
 */
export const formOf = (path: ReadonlyArray<Locator.Node>, root: Locator.Node): Locator.Node | undefined =>
  path[0]?.tag === "form" ? path[0] : ownerOf(root, path)

const radioGroup = (
  root: Locator.Node,
  radio: Locator.Node,
  path: ReadonlyArray<Locator.Node>
): ReadonlyArray<Locator.Node> => {
  const name = radio.attrs?.name
  if (name === undefined) return []
  const form = ownerOf(root, path)
  return Locator.elements(root).filter((other) =>
    other !== radio && other.tag === "input" && inputType(other) === "radio" && other.attrs?.name === name &&
    ownerOf(root, [...(pathIn(root, other) ?? [])].reverse()) === form
  )
}

/** @internal */
export interface ClickEvent {
  readonly node: Locator.Node
  readonly description: string
  readonly event: string
  readonly payload: (root: Locator.Node, at: (node: Locator.Node, description: string) => Locator.Node) => unknown
  readonly isDefault: boolean
  readonly checks?: (() => ReadonlyArray<readonly [node: Locator.Node, checked: boolean]>) | undefined
}

/** @internal */
export const planClick = (
  root: Locator.Node,
  node: Locator.Node,
  path: ReadonlyArray<Locator.Node>,
  description: string,
  step: string
): ReadonlyArray<ClickEvent> => {
  // A disabled fieldset disables the controls in it, not itself as a target.
  if (path.some((at) => at.tag !== "fieldset" && isDisabled(at, path.slice(path.indexOf(at))))) {
    throw new Error(`${step}: ${description} is disabled`)
  }
  const events: Array<ClickEvent> = [
    { node, description, event: "click", payload: () => scene.pointer, isDefault: false }
  ]
  const later = (other: Locator.Node, description: string, event: string, payload: ClickEvent["payload"]) =>
    events.push({ node: other, description, event, payload, isDefault: true })
  const type = node.tag === "input" ? inputType(node) : undefined
  const submitter = submitterIn(path)
  if (type === "checkbox" || (type === "radio" && HtmlLocator.checked(node) !== true)) {
    const payload: Html.InputPayload = {
      value: HtmlLocator.value(node) ?? "on",
      checked: type === "radio" ? true : HtmlLocator.checked(node) !== true,
      files: [],
      composing: false,
      inputType: ""
    }
    events.push({
      node,
      description,
      event: "input",
      payload: () => payload,
      isDefault: true,
      checks: () => [
        ...(type === "radio" ? radioGroup(root, node, path) : []).map((other) => [other, false] as const),
        [node, payload.checked]
      ]
    })
    later(node, description, "change", () => payload)
  } else if (submitter !== undefined) {
    const form = formOf(path.slice(path.indexOf(submitter)), root)
    if (form !== undefined) {
      const formDescription = `the form of ${description}`
      later(
        form,
        formDescription,
        "submit",
        (root, at) => formFields(root, at(form, formDescription), at(submitter, description))
      )
    }
  }
  const invoker = path.find((at) => at.attrs?.popovertarget !== undefined)
  if (invoker !== undefined) {
    const id = invoker.attrs!.popovertarget!
    const popover = Locator.elements(root).find((at) => at.attrs?.id === id && at.attrs?.popover !== undefined)
    const payload = popover === undefined ? undefined : popoverToggle(invoker, popover)
    if (payload !== undefined) later(popover!, `the popover #${id}`, "toggle", () => payload)
  }
  return events
}

/** The nodes from `root` down to `node`, both included. */
const pathIn = (root: Locator.Node, node: Locator.Node): ReadonlyArray<Locator.Node> | undefined => {
  if (root === node) return [root]
  for (const child of root.children ?? []) {
    const rest = pathIn(child, node)
    if (rest !== undefined) return [root, ...rest]
  }
  return undefined
}

/** @internal */
export const inputPayload = (
  node: Locator.Node,
  value: string,
  details?: Partial<Pick<Html.InputPayload, "composing" | "inputType">>
): Html.ValuePayload | Html.InputPayload => {
  const edit = { composing: details?.composing ?? false, inputType: details?.inputType ?? "insertText" }
  return node.tag === "input"
    ? { value, checked: HtmlLocator.checked(node) === true, files: [], ...edit }
    : { value, ...edit }
}

/** @internal */
export const changePayload = (
  node: Locator.Node,
  given: string | Partial<Html.InputPayload>
): Html.ValuePayload | Html.InputPayload => {
  const input = typeof given === "string" ? { value: given } : given
  const edit = { composing: input.composing ?? false, inputType: input.inputType ?? "" }
  const value = input.value ?? HtmlLocator.value(node) ?? ""
  return node.tag === "input"
    ? {
      value,
      checked: input.checked ?? HtmlLocator.checked(node) === true,
      files: inputType(node) === "file" ? input.files ?? [] : [],
      ...edit
    }
    : { value, ...edit }
}

/** @internal */
export const keyPayload = (
  key: string,
  details: Partial<Omit<Html.KeyPayload, "key">> | undefined,
  path: ReadonlyArray<Locator.Node> = []
): Html.KeyPayload => ({
  key,
  shift: details?.shift === true,
  ctrl: details?.ctrl === true,
  alt: details?.alt === true,
  meta: details?.meta === true,
  composing: details?.composing === true,
  repeat: details?.repeat === true,
  editable: details?.editable ?? isEditable(path),
  selectionStart: details?.selectionStart ?? null,
  selectionEnd: details?.selectionEnd ?? null
})

/** @internal */
export const drop = (given: Partial<Html.DropPayload> | undefined) => {
  const payload: Html.DropPayload = { data: {}, files: [], x: 0, y: 0, width: 0, height: 0, ...given }
  const types = Object.keys(payload.data).concat(payload.files.length > 0 ? ["Files"] : [])
  const lowered = types.map((type) => type.toLowerCase())
  return {
    payload,
    accepts: (options: unknown): boolean =>
      ((options as Html.DropTargetOptions | undefined)?.accepts ?? []).some((type) =>
        lowered.includes(type.toLowerCase())
      ),
    noTarget: (step: string, description: string): Error =>
      new Error(
        `${step}: nothing at ${description} accepts ${
          types.length === 0 ? "a drag with no types" : types.map((type) => JSON.stringify(type)).join(", ")
        }`
      )
  }
}

/** @internal */
export const matchers = {
  ...scene.matchers,
  toHaveValue: (expected: string) =>
    scene.single((node) => {
      const value = HtmlLocator.value(node)
      return value === expected ? undefined : `its value is ${JSON.stringify(value)}`
    }),
  toBeChecked: (expected = true) =>
    scene.single((node) => {
      const checked = HtmlLocator.checked(node)
      return checked === expected
        ? undefined
        : `it is ${checked === undefined ? "not checkable" : checked ? "checked" : "unchecked"}`
    }),
  toBeDisabled: (expected = true) =>
    scene.single((node, root) => {
      const disabled = isDisabled(node, [...(pathIn(root, node) ?? [])].reverse())
      return disabled === expected ? undefined : `it is ${disabled ? "disabled" : "enabled"}`
    }),
  toHaveAccessibleName: (expected: string | RegExp) =>
    scene.single((node, root) => {
      const name = HtmlLocator.nameOf(root, node)
      const pass = typeof expected === "string" ? name === expected : expected.test(name)
      return pass ? undefined : `its accessible name is ${JSON.stringify(name)}`
    })
}
