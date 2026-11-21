# ui-kit conventions

A port follows these rules, and `Switch` is the first one built on them.
When a component needs something else, change the rule in a PR and update
the components that already follow it.

## Files and exports

- One module per component, `packages/ui-kit/src/<Name>.ts`, named as in
  Base UI (`Switch`, `ToggleGroup`).
- Consumers import the component by name and call it with their `h`:

  ```ts
  import { Switch } from "@effect/ui-kit"

  // In a view:
  Switch(h, {
    props: { checked: model.notify },
    onToggle: ({ checked }) => Message.ToggledNotify({ checked }),
    view: (parts) => h.label(parts.root(h.button).children(parts.thumb(h.span.class("thumb"))), "Notify")
  })
  ```

  So `src/index.ts` is written by hand, not generated: `pnpm codegen`
  would export each module as a namespace, which can't be called. Add
  `export * from "./<Name>.ts"` to it in alphabetical order.
- Every export starts with the component's name, so the flat barrel never
  has two exports with one name:
  - the view function or component (`Switch`)
  - `<Name>Props`: a type for a view function, a Schema and its type for
    a component. The name is the same in both kinds, so it survives a
    view function becoming a component.
  - `<Name>Events`, a Schema and its type, for a component. A view
    function has `on<Event>` options instead.
  - `<Name>Parts` for a view function that takes `view`
  - any other type the API needs (`SwitchButton`, `ListboxOption`)

  A component's message Schema stays private.
- A public module that isn't a component, such as `Positioning`, has
  unprefixed exports (`Positioning.place`), so the barrel exports it as a
  namespace: `export * as Positioning from "./Positioning.ts"`.
- Code that several components share goes in `src/internal/<topic>.ts`,
  once a second component needs it.
- In `src`, import from module paths (`@effect/ui/Component`,
  `@effect/ui/html/Html`, `effect/Schema`), because the lint rejects barrel
  imports there. Tests may use the barrels.

## Kind

- A **view function** is a plain function that takes the consumer's `h`
  and one options object. It has no instance, so no `key`, Model or
  `update`. Use it when the component keeps no state: every attribute
  follows from its props, and every handler can send the consumer's
  message. `Switch` and `Button` are view functions.
- A **headless component** (`Component.define(...).make({ parts })`) is
  for a component that keeps interaction state, generates an id, runs a
  Command, a mount or a Subscription (focus, a timer, measuring), or
  shares state with the components inside it. The consumer draws every
  element with its own builders.
- A **component with slots** (`Component.define({ slots })`, finished with
  `view`) only fits when the kit must draw the structure itself and the
  consumer only supplies content. It can't take the consumer's builder:
  a slot is an opaque outlet, so the component can neither decorate nor
  fill what the parent passes. A definition can't have both `slots` and
  `parts`.

Decide by what the component does in Base UI, counting what the port
puts off and not only what it implements. `Checkbox` is headless although
its Model is empty, because the indicator's transition state and Enter's
form submission both need an instance. A context that may or may not be
above the component, such as Field, doesn't count: a view function has
no instance to read shared state with, and one way to reach a control
has to work for both kinds. So an optional context reaches the control
through a part on the consumer's builder, `checkbox.root(field.control(h.button))`,
and the control's source doesn't change. `Field` is the worked example:
its `control` writes what another kit call on the element also writes,
such as `disabled`, in `forward`. The part reaches only the element it is
applied to. What the control's other parts depend on is passed as the
control's own prop, from the context's parts: `disabled: field.disabled`. To
undo markup the control added to that element, such as the hidden input,
keep the helper beside the one that adds it (`internal/field.ts`).

A group control, one with several focusable elements such as a range
slider, a checkbox group or a radio group, reaches a Field through
`field.group` and `field.member` instead of `field.control`. Its root takes
`field.group`, `slider.root(field.group(h.div))`, which names it with
`aria-labelledby` from `field.legend` and tracks focus with `focusin` and
`focusout`. Each focusable element takes `field.member`, which writes
`aria-describedby`, `aria-invalid` and the data attributes, but no id and
no focus handlers. Each member keeps its own name. Don't apply `field.control`
to more than one element, since that gives two elements one id, and don't
handle `focusin` or `focusout` on an element between the group and its
members, since that hides them from the field.

ARIA allows `aria-invalid` on `radiogroup` and not on `radio`, the reverse
of a checkbox or a slider. So RadioGroup takes `invalid: field.invalid` and
writes `aria-invalid` on its root, and the radio's root removes the one
`field.member` wrote. The radio's part is applied after `field.member`, so it
writes last.

When a view function with `view` needs state, keep its call. Wrap the
headless component in a function with the same options; the consumer may
need to add a `key`. A one-element view function returns a builder, but a
component returns a `View.Child`. Consumers can no longer chain on the
result, so ship that swap as a breaking change.

## Call shape

Both kinds take `h` and one options object, with the same field names, so
a view function call reads like a component call. The parts inside a
`view` closure are different: each takes the consumer's builder and
returns it (see "Parts").

```ts
// One element: finish the returned builder.
Button(h, {
  props: { disabled: model.saving },
  onPress: Message.PressedSave()
}).class("save").children("Save")

// Several elements: the consumer arranges them in `view`.
Switch(h, {
  props: { checked: model.notify },
  onToggle: ({ checked }) => Message.ToggledNotify({ checked }),
  view: (parts) => parts.root(h.button).children(parts.thumb(h.span.class("thumb")))
})

// A component: core's `onEmit`, and a `key` when it needs one.
Checkbox(h, {
  props: { checked: model.terms },
  onEmit: ({ checked }) => Message.ToggledTerms({ checked }),
  view: (checkbox) => checkbox.root(h.button).children(checkbox.indicator(h.span))
})
```

- `props` is the state, typed as `<Name>Props`. Never put a builder or a
  function in it: a component's props are Schema data, which the log
  records and a replay reads back, and the runtime compares them on every
  render. Leave it optional when every prop is.
- A one-element view function returns its builder. Chain classes, attributes,
  handlers and `.children(...)` on the result; there is no `children` option.
- Pass `element` when you already have a builder, for example from another
  part. A fixed tag defaults to `h.<tag>`; when the consumer chooses the
  tag, `element` is required.
- Use `view` instead when the component has more
  than one element: `view: (parts) => ...` gets the parts, as a headless
  call does. Don't take a builder per part
  (`elements: { root, thumb }`): it stops working once a part has
  children of its own or repeats.
- Name the parts argument as "Headless components" in
  `ai-docs/src/10_ui/index.md` says, in the JSDoc, the README and the
  tests: `view: (checkbox) => checkbox.root(h.button)`, and `parts` for
  `Switch`, whose name is a reserved word.
- `on<Event>` is a view function's event, one option per event. Name it
  as the present tense of the event a component would emit: `onPress`
  for `Pressed`, `onToggle` for `Toggled`. An event with no payload takes
  the message, like `.onClick(msg)`. One with a payload takes a function
  of the object a component's event would carry,
  `onToggle: ({ checked }) => msg`. Type the message `NoInfer<Msg>`, so
  `Msg` comes from `h`. Omitting `onPress` means Button sends no press
  message. The consumer keeps its click handler only if no option reserves
  the event. With `focusableWhenDisabled: true`, Button rejects a consumer
  click handler even while enabled. When disabled, it installs a handler
  that cancels the click without sending a message. A component keeps
  core's `onEmit`.
- Type `h` by what the function needs from it: the tags it draws
  (`{ readonly button: ... }`), or `View.Helper<Msg, unknown>` when it
  only needs the message type. Not `View.H`, which needs the app to
  register a vocabulary.

## Identity

A view function has no identity, so a view can call it any number of
times. A component call has a key, and core lets it leave the key out
(EFF-3930):

```ts
// The only Checkbox its parent renders: no key.
Checkbox(h, { props: { checked: model.terms }, onEmit, view })

// Rows: a stable key from the row's data, never its index.
todos.map((todo) => Checkbox(h, { key: todo.id, props: { checked: todo.done }, onEmit, view }))

// Branches: a key each when the state shouldn't carry over.
model.advanced
  ? Listbox(h, { key: "advanced", props: advanced, view })
  : Listbox(h, { key: "basic", props: basic, view })
```

- Two children of one component under a parent each need a key. A second
  unkeyed one fails the parent's render, and the error asks for a `key`.
- Every row in a list needs a key, even a list of one: it renders until a
  second row arrives. Use the row's id, so a row keeps its instance when
  the list reorders.
- Two calls at one path are one instance. An unkeyed call in each branch
  of a condition keeps its Model across the switch, so key the branches
  when the component has interaction state to reset.
- Examples in the docs leave the key out when they render one component.
- A `Scene` of a consumer names a child by its component, then by its key
  when it has one: `s.childEmit(Checkbox, { _tag: "Toggled", checked: true })`,
  `s.childEmit(Checkbox, todo.id, event)`.

## Parts

- One part per Base UI part, in camelCase: `Switch.Thumb` is `thumb`,
  `Select.Popup` is `popup`.
- Each part accepts the native tag that gives the behaviour for free: a
  `<button>` for anything pressable, so Space, Enter and focus come from
  the browser and need no key handler. List several tags only when Base
  UI supports them and the behaviour holds for each. A headless part is
  declared with the tag, `p.part("button", ...)`, and rejects another at
  runtime. A view function's part is typed by its `element`.
- A part sets ARIA, data attributes, ids, refs and handlers. It writes
  inline style only for what its job depends on: a declaration that
  carries state or a generated name, such as the width of `Progress`'s
  indicator or the placement of `Tooltip`'s positioner, a custom
  property the consumer's stylesheet reads (`--toast-index`), and the
  resets those need to work. It adds them in `forward` with `withStyle`
  (`internal/attributes.ts`), after the consumer's inline style, so its
  own win and the consumer's other declarations stay. The look is the
  consumer's. When the element can be drawn another way, the parts also
  carry the value behind the declaration, such as `progress.percentage`, so
  the consumer can skip the part.
- **Call shape.** A part takes the consumer's builder as its one argument
  and returns it, with the part applied. The consumer goes on chaining,
  and adds children with `.children(...)`:

  ```ts
  checkbox.root(h.button.class("checkbox")).children(checkbox.indicator(h.span.class("tick")))
  ```

  A part takes an options object only when it has more than one argument,
  such as a tab's `value`. It still returns the builder, and `children` is
  never a field of it:

  ```ts
  tabs.tab({ element: h.button, value: "a" }).children("Account")
  ```

  Each part has one form, with no overloads. A part that may not show
  returns `undefined`, and the consumer writes
  `avatar.fallback(h.span)?.children("AL")`. Apply the part before deciding, so
  a wrong tag throws in every state.

  Use the same field names across components: `element` for the
  consumer's builder, and the Base UI name for anything else (`value`,
  `item`). Type a part by the builder it takes and returns,
  `<R = never>(element: SwitchButton<Msg, R>) => SwitchButton<Msg, R>`,
  as `SwitchParts` does.

  `Listbox.ts` in `ai-docs` shows the core API, where a part takes the
  builder and extra arguments positionally (`listbox.option(h.li, option)`).
  ui-kit wraps `p.part` to take the options object, with `View.wrapPart`.
  A part with only the builder is the `p.part` itself.
- **Stacking.** A part's result is a builder, so it is also another kit
  call's `element`, and both share one element. Every part has this form,
  including one that adds markup.

  ```ts
  Button(h, {
    element: tooltip.trigger(h.button),
    onPress: Message.PressedBold()
  }).class("tool").children("B")
  ```
- **The kit's attributes win** over the consumer's. A part or view
  function writes every attribute it owns in every state, with `undefined`
  where the state leaves it absent: `disabled`, `aria-readonly`, the data
  attributes.
  `.attr(name, undefined)` and `.disabled(false)` remove the consumer's
  value, in a headless part too. That includes an attribute the kit
  never sets but mustn't leave to the consumer, such as `aria-disabled`
  on a part that uses the native `disabled`. Otherwise a consumer's
  `disabled` or `data-checked` reports a state the props don't have.
  - A part returns the builder, so the consumer can chain on it after the
    part. A view function's part does its writes in `forward`, whose
    function gets the builder as the consumer finished it, when the
    element is built. So they win over what the consumer set before the
    part and after it:

    ```ts
    const thumb = (element) => element.forward((node) => state(node, props))
    ```

    A headless part writes when it is applied, so it wins over what the
    builder had. What a consumer chains after a headless part is the
    consumer's to answer for. Write an attribute again in a `forward`
    inside `p.part` when it mustn't be overridden.
  - Token lists such as `class` and `aria-describedby` merge, and a part
    can't remove the consumer's tokens.
  - An attribute the kit never names keeps the consumer's value, so the
    ones it doesn't decide, such as `aria-label` or `popovertarget`,
    stay the consumer's.
  - When two kit calls share an element, a headless part writes first,
    as it writes when it is applied. Of two headless parts, the outer
    one writes last. Of two calls that write in `forward`, the inner one
    writes last.
  - DOM properties set with `.prop` are the consumer's own doing, and
    the kit doesn't guard them.
- **Handlers.** A headless part's handlers sit on a layer of their own.
  Every layer's handler runs, the deepest component's first and the
  consumer's last, so a handler the consumer set on `element` runs after
  the part's. A view function has no layer: its handler is the
  consumer's handler for that event and would replace the consumer's
  own. So a view function throws at render when it was given an
  `on<Event>` and the element already handles the event that option
  sets, as `Switch`'s root does for `click` with `onToggle`. A view function or its part checks the final
  node in `forward`, so the check sees handlers chained after the call.
  Decide by the options, not the current state. Button reserves `click`
  when it has `onPress` or `focusableWhenDisabled: true`, even while
  enabled. With neither, the consumer's click handler stays.
  - With no handler on an element, the host gives the event to the
    nearest ancestor that handles it. So a click on a read-only control
    reaches the row around it. Don't promise that for a natively
    disabled one: the browser gives it no click.
- **Cancelling.** `on<Event>` and `onEmit` say what to send. They never
  cancel the native event, and the consumer gets no option to. The kit
  cancels only when the props rule the native action out, with
  `preventDefault: "always"` on the handler, as a disabled button that
  stays focusable does for its click. Cancelling doesn't silence a handler
  on a headless part's separate layer. Sending a message cancels nothing:
  a `type: "reset"` button resets its form with or without `onPress`. A
  consumer who wants the press without the native action changes the
  props (`type: "button"`, `disabled`).
- **Markup the component needs to work**, such as a form field, must not be
  a part the consumer can forget to draw. The part it belongs to adds it
  with `.children(...)` and returns the builder, so it comes before the
  consumer's children, as `Switch`'s root does with its hidden input. A
  headless part does the same inside `p.part`:

  ```ts
  root: p.part("button", (b) => b.attr("role", "checkbox").children(hidden))
  ```

  A part has no `h`, so it builds the markup from Html's element classes,
  as `internal/field.ts` does with
  `View.toNode(new Html.VoidElement("input")...)`. Only put markup where
  the content model allows it: a hidden input may sit in a `<button>`, a
  checkbox may not.
  - Markup that has to come after the consumer's children is added in
    `forward`: `element.forward((node) => node.children(extra))`.
  - Markup that has to go around the consumer's element is returned from
    `forward`: `element.forward((node) => frame.children(node, extra))`.
    The consumer's chain and children still land on their element, and a
    key moves to the frame. Prefer markup inside: a wrapper is an element
    the consumer can't style through the chain. When a wrapper is needed
    and the consumer should style it, take its builder as an argument.
- **A focusable element the kit places**, such as a slider thumb's
  `<input type="range">`, is the consumer's builder too. The part that
  places it takes it as a second field next to `element`, named for
  what it is, and decorates and places it:

  ```ts
  slider.thumb({ element: h.div.class("thumb"), input: field.control(h.input) })
  ```

  The consumer must name that element and reach it with other kit calls,
  such as `Field`'s `field.control`, so the kit doesn't build it the way it
  builds a hidden form field. What the consumer set on it stays, and the
  field is required, so it can't be left out. `Slider` is the worked
  example.
- **A wrapped part drops its mount's requirements** (EFF-3914). A headless
  component's requirements come from the parts it returns, and a plain
  function around `p.part` hides them, so a consumer can forget to
  provide the service a part's `onMount` needs. If a part has such a
  mount, use the workaround in EFF-3914, and check the requirement in the
  component's typetest with `Component.Headless.Requirements`.
- The parts also carry plain values for markup that depends on state, in
  place of Base UI's `className(state)` functions: `checkbox.checked`, `menu.open`.

## Messages and events

- Name messages, events, Commands and mounts by the "Naming" section of
  `ai-docs/src/10_ui/index.md`, which `LLMS.md` includes. Base UI's
  callback names are never event names: Switch has `onToggle` and a
  Checkbox emits `Toggled`, not `CheckedChange`.
- `update` is a record with one function per message tag, even for a
  union with one member. A reader sees every message handled, and a new
  message is a type error until it has a key. Use the function form only
  for a catch-all, or for an `update` that doesn't dispatch on the tag,
  such as `update: (model) => model`.
- Logic that several tags share is a function above the component. When
  it is the whole handler, give it a handler's parameters,
  `(model, message, $)`, so it is the key's value: `LeftTrigger: left`.
  Otherwise the handlers call it with `model` and `$`. Type its `$` as
  `Component.Update` over the component's Model, message, events and
  props types, which every tag's `$` fits. `Tooltip.ts` has both.

## State

- The value is controlled. It comes in through props (`checked`, `value`,
  `open`), and the component reports the value the user asked for, in
  place of Base UI's `on<Value>Change`. There are no `default*` props:
  the consumer keeps the value in its Model.
- A component's Model holds only interaction state the consumer would
  never store: the active row, the typeahead buffer.
- The exception is a queue the app posts to, such as `ToastProvider`'s
  toasts. Its items outlive the app's interest in them: a closing toast
  keeps its content on screen until its exit transition ends, and the
  limit, timers and focus hand-off all read the list. So the owner keeps
  the list in its Model, and the components inside its closure post facts
  to it with `$.send(Owner, message)` through `receives` (`AddedToast`,
  `UpdatedToast`, `ClosedToast`), each naming an item by an id the sender
  picks. The owner emits an event for what the user did, such as
  `Dismissed`, and nothing for what a sender asked. Its settings, such as
  `timeout` and `limit`, are still props.
- A disabled or read-only control reports nothing. A component's `update`
  checks `disabled` and `readOnly`, so no message gets through even if an
  event fires. A view function sets no handler in those states.

## Popups and the top layer

A React portal only moves where a popup renders. Choose the top-layer element
by who decides when the popup closes, not because the React source uses a
portal. The details are in the JSDoc of `popover` and `modal` in
`packages/ui/src/html/Html.ts`.

- `.popover("manual", open)` is controlled: the host shows and hides the
  popup as `open` says, and restores it if anything else changes it. Use
  it when `open` is a prop. Dismissal is then the kit's job: Escape and a
  press outside each emit `Dismissed`. Blur and pointer-leave don't stand
  in for the outside press: it must also close a popup that focus, a close
  delay or the consumer keeps open. A popup that opens with focus inside
  handles Escape on the focused part. One that opens without focus, such
  as `Tooltip` on hover, hears neither on a part, so it listens on its
  document: `subscriptions` holds `Html.onDocument` entries gated on the
  popup showing, one for Escape and one for mouse presses in the capture
  phase, as `Tooltip` does. The Escape entry cancels the key's default and
  skips one that's `defaultPrevented`, so a field inside or an enclosing
  dialog keeps its own. Which presses are outside is the component's call:
  `Tooltip` already tracks whether the pointer is on its parts, so its
  `update` decides. The payload doesn't carry the press's target, so a
  popup that doesn't track the pointer, or that moves focus in the same
  handler, still uses a stream mount on the popover. The popup stays open
  until the consumer passes `open: false`, so a consumer can refuse.
- A popup that sits next to an anchor is placed by `Positioning`
  (`packages/ui-kit/src/Positioning.ts`), as `Tooltip` does: spread
  `PositionerFields` into the props, keep the reported `Placement` in the
  Model, and issue `TrackPosition` on the positioner while the popup
  shows. Don't use CSS anchor positioning.
- `.popover("auto", open)` with `onToggle` follows the browser: it closes
  on Escape, an outside click, or another auto popover opening, and the
  Model stores what `onToggle` reports. Use it only when `open` is the
  component's own Model state and nobody can refuse a close, as in
  `Listbox`. Never use it for an `open` prop: the browser would close the
  popup while the props still say open.
- `<dialog>` with `.modal(open)` and `onCancel` is a controlled modal: the
  host cancels Escape and backdrop clicks and reports them as `onCancel`,
  which emits `Dismissed`. Browsers may still force a close after repeated
  cancels, so handle `onClose` too and emit `Dismissed` from it.

## Data attributes and ARIA

- Use Base UI's names, on the parts Base UI puts them on.
- A data attribute is present with an empty value, or absent:
  `.attr("data-checked", on ? "" : undefined)`.
- Attributes only a Field has, such as `data-invalid` and
  `data-touched`, reach the control through `field.control` or `field.member`,
  so the control doesn't set them. One both write, such as `disabled`, is the field's
  while the field is disabled. Attributes that come from a Form context
  wait for that component.
- ARIA follows Base UI's source, not just its docs page. Prefer a native
  attribute (`disabled`) where Base UI's native mode uses one.

## Docs

The module JSDoc has, in order:

1. one sentence on what the component does, then which kind it is
2. **Anatomy**: the kit part names and their elements,
   then a line on what each part takes and the markup it adds
3. **Data attributes**
4. **Keyboard**
5. any usage limits or form behavior the consumer needs to know
6. one `**Example**` that runs as a doctest and checks the rendered HTML

The JSDoc of the view function or component lists the attributes and
events it owns. Each export has `@stability experimental`, `@category`
and `@since`.
