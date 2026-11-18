/**
 * `Scene` with the HTML vocabulary: steps that send what the browser host
 * sends for each user action, and assertions on fields.
 *
 * `HtmlScene.Steps` extends `Scene.Steps`, so every scene step works here.
 * Each payload is typed from the host's own payload types in `Html`, so a
 * test can't send a shape the host never would. `click` runs the browser's
 * defaults: it throws on a disabled control, a submit button submits its
 * form with the fields read from the view, a checkbox or radio button fires
 * `input` and `change`, and a `popovertarget` button toggles its popover.
 * The events of one click are one interaction for the acknowledgement rule.
 *
 * **Example** (A weather lookup)
 *
 * ```ts import.meta.vitest
 * import { Command, Component } from "@effect/ui"
 * import { Html } from "@effect/ui/html"
 * import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = Schema.TaggedUnion({
 *   UpdatedZip: { zip: Schema.String },
 *   SubmittedForm: { zip: Schema.String },
 *   CompletedFetchWeather: { forecast: Schema.String }
 * })
 *
 * class FetchWeather extends Command.Service<FetchWeather>()(
 *   "weather/FetchWeather",
 *   { args: { zip: Schema.String } },
 *   Effect.succeed(() => Effect.succeed(Message.make({ _tag: "CompletedFetchWeather", forecast: "sun" })))
 * ) {}
 *
 * const Weather = Component.define({
 *   name: "Weather",
 *   model: Schema.Struct({ zip: Schema.String, forecast: Schema.String }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ zip: "", forecast: "" }),
 *   update: (model, message, $) =>
 *     Message.match(message, {
 *       UpdatedZip: ({ zip }) => ({ ...model, zip }),
 *       SubmittedForm: ({ zip }) => $.run(FetchWeather.make({ zip })),
 *       CompletedFetchWeather: ({ forecast }) => ({ ...model, forecast })
 *     }),
 *   view: (model, h) =>
 *     h.div(
 *       h.form.onSubmit(({ fields }) => Message.make({ _tag: "SubmittedForm", zip: fields.zip ?? "" })).children(
 *         h.label.attr("for", "zip").children("Zip code"),
 *         h.input.attr("id", "zip").attr("name", "zip").value(model.zip)
 *           .onInput(({ value }) => Message.make({ _tag: "UpdatedZip", zip: value })),
 *         h.button.children("Get Weather")
 *       ),
 *       h.p.attr("role", "status").children(model.forecast)
 *     )
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Weather, {})
 *   s.type(HtmlLocator.label("Zip code"), "90210")
 *     // A submit button submits its form, with the fields read from the view.
 *     .click(HtmlLocator.role("button", { name: "Get Weather" }))
 *     .expectExact(FetchWeather.make({ zip: "90210" }))
 *     .resolve(FetchWeather, Message.make({ _tag: "CompletedFetchWeather", forecast: "sun" }))
 *     .expect(HtmlLocator.role("status")).toHaveText("sun")
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Component from "../../Component.ts"
import * as internal from "../../internal/scene.ts"
import * as cursor from "../../internal/steps.ts"
import * as engine from "../../internal/story.ts"
import * as Locator from "../../testing/Locator.ts"
import type * as Scene from "../../testing/Scene.ts"
import type * as View from "../../View.ts"
import type * as Html from "../Html.ts"
import * as HtmlLocator from "./HtmlLocator.ts"

/**
 * The assertions `expect(locator)` offers in an `HtmlScene`: the scene's,
 * plus checks on fields. The checks on fields want exactly one match.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Expect<S> extends Scene.Expect<S> {
  /** Asserts the field's current value, as `HtmlLocator.value` reads it. */
  toHaveValue(value: string): S
  /** Asserts that the checkbox or radio button is checked, or isn't with `false`. */
  toBeChecked(checked?: boolean): S
  /** Asserts that the element is disabled, or isn't with `false`. */
  toBeDisabled(disabled?: boolean): S
  /** Asserts the element's accessible name, as `HtmlLocator.nameOf` computes it. */
  toHaveAccessibleName(name: string | RegExp): S
}

// The same union as `Scene.ts`'s.
type AnyComponent =
  | Component.Component<any, any, any, any, any, any, any, any, any>
  | Component.Component<any, any, any, never, any, any, any, any, any>
  | Component.Component<any, any, any, any, any, any, any, any, never>
  | Component.Component<any, any, any, never, any, any, any, any, never>

/** The modifier keys of a key or pointer payload, each `false` unless given. */
type Modifiers = Partial<Pick<Html.KeyPayload, "shift" | "ctrl" | "alt" | "meta">>

/**
 * A cursor over one HTML scene: the scene's steps, plus a step per user
 * action the browser host turns into an event. Each one is an interaction.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Steps<C extends AnyComponent, Parts = never> extends Scene.Steps<C, Parts> {
  /**
   * Clicks the one element `target` matches, as a browser does: the `click`
   * goes to the innermost element that handles it, then the defaults run.
   * A string means `Locator.text(target)`.
   *
   * **Details**
   *
   * - A disabled `button`, `input`, `select` or `textarea`, or one inside a
   *   disabled `fieldset`, throws: the browser sends it nothing.
   * - A submit button submits its form: `submit` goes to the form with the
   *   fields read from the view, the button's own name and value included.
   * - A checkbox fires `input` and `change` with `checked` flipped, and an
   *   unchecked radio button with `checked: true`.
   * - A button with `popovertarget` fires `toggle` on the popover with the
   *   state `popovertargetaction` asks for, when that changes it.
   *
   * Each event goes to the view as the event before it left it. The click
   * throws when nothing handles any of them, and is ignored when none
   * produced a message.
   */
  click(target: string | Locator.Locator): this
  /**
   * Sets a field's value as typing does: sends `input` with `value`. An
   * `input` also sends its current `checked`.
   */
  type(locator: Locator.Locator, value: string): this
  /**
   * Sends `change`, as a field does once its edit is committed. A string is
   * the new value; an object also sets `checked` on an `input`.
   */
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): this
  /** Presses `key`: sends `keydown` with the modifier keys given, each `false` otherwise. */
  keydown(locator: Locator.Locator, key: string, modifiers?: Modifiers): this
  /**
   * Submits the form `locator` matches, or the one the matched element is
   * in, as pressing Enter in it would: `submit` goes to the form with the
   * fields read from the view. No button counts as the submitter.
   */
  submit(locator: Locator.Locator): this
  /** Sends `focus`. */
  focus(locator: Locator.Locator): this
  /** Sends `blur`. */
  blur(locator: Locator.Locator): this
  /**
   * Drops `payload` on the element `locator` matches, as the browser host
   * would. Missing payload fields default to empty data, no files and a
   * zero box. The drag's types are the keys of `data`, plus `"Files"` when
   * `files` isn't empty.
   *
   * **Details**
   *
   * The drop goes to the innermost element, the matched one or an ancestor,
   * whose `onDrop` accepts one of those types, compared without case. It
   * throws when no drop target there accepts the types. The browser host
   * always cancels a drop on a target, so the default is cancelled.
   */
  drop(locator: Locator.Locator, payload?: Partial<Html.DropPayload>): this

  /** Asserts on the elements `locator` matches in the current view. */
  expect(locator: Locator.Locator): Expect<this>
}

/**
 * Helper types for `Steps`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Steps {
  /**
   * A cursor over any component, for steps shared across components.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Any = Steps<AnyComponent, any>
}

// ---------------------------------------------------------------------------
// what the browser derives from the tree
// ---------------------------------------------------------------------------

const lower = (value: string | undefined) => value?.toLowerCase()

const inputType = (node: Locator.Node): string => lower(node.attrs?.type) ?? "text"

/** An attribute set, or a property set to `true`. */
const flag = (node: Locator.Node, name: string): boolean =>
  node.props?.[name] === true || (node.props?.[name] === undefined && node.attrs?.[name] !== undefined)

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
 */
const isDisabled = (node: Locator.Node, path: ReadonlyArray<Locator.Node> = []): boolean => {
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
 */
const formFields = (
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

/** Child indices from the root to `node`, to find it again in a view rendered after an event. */
const indexPath = (root: Locator.Node, node: Locator.Node): ReadonlyArray<number> | undefined => {
  if (root === node) return []
  const children = root.children ?? []
  for (let i = 0; i < children.length; i++) {
    const rest = indexPath(children[i]!, node)
    if (rest !== undefined) return [i, ...rest]
  }
  return undefined
}

/** `node` in `state`'s view: itself while the view is the one it came from, else the node at its place. */
const follow = (root: Locator.Node, node: Locator.Node, description: string) =>
(
  state: engine.State<any, any, any, any>
): Locator.Node => {
  if (state.root === root) return node
  let at: Locator.Node | undefined = state.root
  for (const index of indexPath(root, node) ?? []) at = at?.children?.[index]
  if (at === undefined || at.tag !== node.tag) {
    throw new Error(`HtmlScene.click: ${description} is no longer in the view`)
  }
  return at
}

/** The form `path[0]` submits: itself when it is a form, else its form owner. */
const formOf = (path: ReadonlyArray<Locator.Node>, root: Locator.Node): Locator.Node | undefined =>
  path[0]?.tag === "form" ? path[0] : ownerOf(root, path)

// ---------------------------------------------------------------------------
// the cursor
// ---------------------------------------------------------------------------

class StepsImpl extends internal.SceneCursor {
  override click(target: string | Locator.Locator): this {
    const locator = typeof target === "string" ? Locator.text(target) : target
    return this.interact("click", (state) => {
      const step = this.name("click")
      const node = engine.findOne(state, locator, step)
      const root = state.root
      const path = engine.ancestry(state, node) as ReadonlyArray<Locator.Node>
      // A disabled fieldset disables the controls in it, not itself as a target.
      if (path.some((at) => at.tag !== "fieldset" && isDisabled(at, path.slice(path.indexOf(at))))) {
        throw new Error(`${step}: ${locator.description} is disabled`)
      }
      const events: Array<internal.PlannedEvent> = [
        {
          node: () => node,
          description: locator.description,
          event: "click",
          payload: () => internal.pointer,
          optional: true
        }
      ]
      // The click's defaults run after it, unless a handler cancelled it.
      const later = (
        other: Locator.Node,
        description: string,
        event: string,
        payload: internal.PlannedEvent["payload"]
      ) =>
        events.push({
          node: follow(root, other, description),
          description,
          event,
          payload,
          optional: true,
          isDefault: true
        })
      const type = node.tag === "input" ? inputType(node) : undefined
      const submitter = submitterIn(path)
      if (type === "checkbox" || (type === "radio" && HtmlLocator.checked(node) !== true)) {
        const payload: Html.InputPayload = {
          value: HtmlLocator.value(node) ?? "on",
          checked: type === "radio" ? true : HtmlLocator.checked(node) !== true
        }
        later(node, locator.description, "input", () => payload)
        later(node, locator.description, "change", () => payload)
      } else if (submitter !== undefined) {
        const form = formOf(path.slice(path.indexOf(submitter)), root)
        if (form !== undefined) {
          // Read when the submit runs, from the view the click left.
          const submitterAt = follow(root, submitter, locator.description)
          later(
            form,
            `the form of ${locator.description}`,
            "submit",
            (at, formAt) => formFields(at.root, formAt, submitterAt(at))
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
    })
  }
  type(locator: Locator.Locator, value: string): this {
    return this.one(
      "type",
      locator,
      "input",
      (node) => node.tag === "input" ? { value, checked: HtmlLocator.checked(node) === true } : { value }
    )
  }
  change(locator: Locator.Locator, value: string | Partial<Html.InputPayload>): this {
    const given = typeof value === "string" ? { value } : value
    return this.one("change", locator, "change", (node) =>
      node.tag === "input"
        ? {
          value: given.value ?? HtmlLocator.value(node) ?? "",
          checked: given.checked ?? HtmlLocator.checked(node) === true
        }
        : { value: given.value ?? HtmlLocator.value(node) ?? "" })
  }
  keydown(locator: Locator.Locator, key: string, modifiers?: Modifiers): this {
    const payload: Html.KeyPayload = {
      key,
      shift: modifiers?.shift === true,
      ctrl: modifiers?.ctrl === true,
      alt: modifiers?.alt === true,
      meta: modifiers?.meta === true,
      composing: false
    }
    return this.one("keydown", locator, "keydown", () => payload)
  }
  submit(locator: Locator.Locator): this {
    return this.interact("submit", (state) => {
      const step = this.name("submit")
      const node = engine.findOne(state, locator, step)
      const form = formOf(engine.ancestry(state, node) as ReadonlyArray<Locator.Node>, state.root)
      if (form === undefined) throw new Error(`${step}: ${locator.description} isn't in a form`)
      return [{
        node: () => form,
        description: `the form of ${locator.description}`,
        event: "submit",
        payload: () => formFields(state.root, form, undefined)
      }]
    })
  }
  focus(locator: Locator.Locator): this {
    return this.one("focus", locator, "focus", () => ({}))
  }
  blur(locator: Locator.Locator): this {
    return this.one("blur", locator, "blur", () => ({}))
  }
  drop(locator: Locator.Locator, payload?: Partial<Html.DropPayload>): this {
    const full: Html.DropPayload = { data: {}, files: [], x: 0, y: 0, width: 0, height: 0, ...payload }
    const types = Object.keys(full.data).concat(full.files.length > 0 ? ["Files"] : [])
    const lowered = types.map((type) => type.toLowerCase())
    return this.interact("drop", (state) => {
      const step = this.name("drop")
      const node = engine.findOne(state, locator, step)
      // Any layer's `onDrop` makes a target, a part's included. The scene then decides which layers run.
      const target = engine.ancestry(state, node).find((at): at is View.Element<any, any> =>
        at._tag === "Element" &&
        [at, ...(at.owned ?? [])].some((layer) =>
          Object.hasOwn(layer.handlers, "drop") &&
          ((layer.eventOptions.drop as Html.DropTargetOptions | undefined)?.accepts ?? []).some((type) =>
            lowered.includes(type.toLowerCase())
          )
        )
      )
      if (target === undefined) {
        throw new Error(
          `${step}: nothing at ${locator.description} accepts ${
            types.length === 0 ? "a drag with no types" : types.map((type) => JSON.stringify(type)).join(", ")
          }`
        )
      }
      return [{
        node: () => target as unknown as Locator.Node,
        description: `the drop target at ${locator.description}`,
        event: "drop",
        payload: () => full
      }]
    }).markPrevented()
  }
  /** A drop on a target is always cancelled by the host. */
  private markPrevented(): this {
    return this.replace(engine.update(this.state, { defaultPrevented: true }))
  }
  override expect(locator: Locator.Locator): object {
    return this.expectation(locator, {
      ...internal.matchers,
      toHaveValue: (expected: string) =>
        internal.single((node) => {
          const value = HtmlLocator.value(node)
          return value === expected ? undefined : `its value is ${JSON.stringify(value)}`
        }),
      toBeChecked: (expected = true) =>
        internal.single((node) => {
          const checked = HtmlLocator.checked(node)
          return checked === expected
            ? undefined
            : `it is ${checked === undefined ? "not checkable" : checked ? "checked" : "unchecked"}`
        }),
      toBeDisabled: (expected = true) =>
        internal.single((node, root) => {
          const disabled = isDisabled(node, [...(pathIn(root, node) ?? [])].reverse())
          return disabled === expected ? undefined : `it is ${disabled ? "disabled" : "enabled"}`
        }),
      toHaveAccessibleName: (expected: string | RegExp) =>
        internal.single((node, root) => {
          const name = HtmlLocator.nameOf(root, node)
          const pass = typeof expected === "string" ? name === expected : expected.test(name)
          return pass ? undefined : `its accessible name is ${JSON.stringify(name)}`
        })
    })
  }
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

/**
 * Starts an HTML scene: `init` with `props`, as a cursor in a scope. It
 * takes what `Scene.make` takes, and runs the same end check when the scope
 * closes.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make: {
  <C extends AnyComponent>(component: C, props: Component.Props<C>): Effect.Effect<Steps<C>, never, Scope.Scope>
  <C extends AnyComponent, V extends View.Elements = never>(
    component: C,
    props: Component.Props<C>,
    options: {
      readonly elements?: View.Vocabulary<V> | undefined
      readonly slots: (
        h: View.Helper<never, unknown> & View.Tags<[V] extends [never] ? VocabularyOf<C> : V, never>
      ) => { readonly [K in Component.Slots<C>]?: View.Input<never, any> }
    }
  ): Effect.Effect<Steps<C>, never, Scope.Scope>
  <Props, Events, Parts, R, Rcv, V extends View.Elements = never>(
    component: Component.Headless<Props, Events, Parts, R, Rcv>,
    props: Props,
    options: {
      readonly elements?: View.Vocabulary<V> | undefined
      readonly view: (parts: Parts, h: View.Helper<never, Props> & View.Tags<V, never>) => View.Content<never, any>
    }
  ): Effect.Effect<Steps<Component.Component<string, Props, any, any, Events, R, V>, Parts>, never, Scope.Scope>
} = (component: any, props: any, options?: any): any =>
  cursor.scoped(make, () => internal.begin(StepsImpl, "HtmlScene", component, props, options))

/**
 * The cursor after `init`. Its steps follow the acknowledgement rule, but
 * nothing checks what's pending or unacknowledged at the end.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const start: {
  <C extends AnyComponent>(component: C, props: Component.Props<C>): Steps<C>
  <Props, Events, Parts, R, Rcv, V extends View.Elements = never>(
    component: Component.Headless<Props, Events, Parts, R, Rcv>,
    props: Props,
    options: {
      readonly elements?: View.Vocabulary<V> | undefined
      readonly view: (parts: Parts, h: View.Helper<never, Props> & View.Tags<V, never>) => View.Content<never, any>
    }
  ): Steps<Component.Component<string, Props, any, any, Events, R, V>, Parts>
} = (component: any, props: any, options?: any): any =>
  internal.begin(StepsImpl, "HtmlScene", component, props, options)

/** The vocabulary a component's view builds from. */
type VocabularyOf<C> = C extends { readonly "~V"?: infer V } ? V : never
