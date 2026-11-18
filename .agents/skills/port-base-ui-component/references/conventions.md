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
    onToggle: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
    view: (s) => h.label(s.root({ element: h.button, children: [s.thumb(h.span.class("thumb"))] }), "Notify")
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
above the component, such as Field, doesn't count: a reader of shared
state doesn't compile without its owner above it, so an optional context
reaches the control through a part on the consumer's builder,
`s.root({ element: f.control(h.button) })`.

When a view function later needs state, keep its call. Put the headless
component behind a function with the same options, so a consumer adds at
most a `key`.

## Call shape

Both kinds take `h` and one options object, with the same field names:

```ts
// One element: the kit finishes it.
Button(h, {
  element: h.button.class("save"),
  props: { disabled: model.saving },
  onPress: Message.make({ _tag: "PressedSave" }),
  children: ["Save"]
})

// Several elements: the consumer arranges them in `view`.
Switch(h, {
  props: { checked: model.notify },
  onToggle: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
  view: (s) => s.root({ element: h.button, children: [s.thumb(h.span.class("thumb"))] })
})

// A component: core's `onEmit`, and a `key` when it needs one.
Checkbox(h, {
  props: { checked: model.terms },
  onEmit: ({ checked }) => Message.make({ _tag: "ToggledTerms", checked }),
  view: (s) => s.root({ element: h.button, children: [s.indicator({ element: h.span })] })
})
```

- `props` is the state, typed as `<Name>Props`. Never put a builder or a
  function in it: a component's props are Schema data, which the log
  records and a replay reads back, and the runtime compares them on every
  render. Leave it optional when every prop is.
- `element` is the consumer's builder, a sibling of `props`. It carries
  the class, the consumer's attributes and handlers, and any other part
  already applied to it. A view function that draws one element with a
  fixed tag defaults it to `h.<tag>`, so `Button(h, { onPress, children })`
  works. Everywhere the tag is the consumer's choice, and on every part,
  `element` is required: the kit doesn't pick markup for the consumer.
- `children` is what goes inside, as an array. **Children always go in
  `children`, and the call returns a finished node.** Nobody calls
  `.children()` on something the kit returned, so the kit can add markup
  of its own later, such as a hidden input, without changing a call site.
- `view` replaces `element` and `children` when the component has more
  than one element: `view: (parts) => ...` gets the parts, as a headless
  call does. Don't take a builder per part
  (`elements: { root, thumb }`): it stops working once a part has
  children of its own or repeats.
- `on<Event>` is a view function's event, one option per event. Name it
  as the present tense of the event a component would emit: `onPress`
  for `Pressed`, `onToggle` for `Toggled`. An event with no payload takes
  the message, like `.onClick(msg)`. One with a payload takes a function
  of the object a component's event would carry,
  `onToggle: ({ checked }) => msg`. Type the message `NoInfer<Msg>`, so
  `Msg` comes from `h`. Left out, it sets no handler: the host gives an
  event to the innermost element with a handler, so one that sends
  nothing would swallow a click meant for an ancestor. A component keeps
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
- A part sets ARIA, data attributes, ids, refs and handlers, and nothing
  visual.
- **Call shape.** When a part takes just a builder and adds no markup, pass
  the builder positionally. Use the decorated builder directly as a child.
  For children, extra fields, or a part that adds markup, pass an options
  object to get the finished node:

  ```ts
  s.root({ element: h.button.class("switch"), children: [s.thumb(h.span.class("thumb"))] })
  s.tab({ element: h.button, value: "a", children: ["Account"] })
  ```

  Use the same field names across components: `element` for the
  consumer's builder, `children` for what goes inside, and the Base UI
  name for anything else (`value`, `item`). Type `element` as the
  builders the part accepts, and keep the children's requirements
  inferred, as `SwitchParts` does.

  `Listbox.ts` in `ai-docs` shows the core API, where a part takes the
  builder and extra arguments positionally (`m.option(h.li, option)`).
  ui-kit wraps `p.part` to take the options object.
- **Stacking.** A part that adds no markup can also supply its decorated builder
  as another kit call's `element`, so both share one element.

  ```ts
  Button(h, {
    element: t.trigger(h.button.class("tool")),
    onPress: Message.make({ _tag: "PressedBold" }),
    children: ["B"]
  })
  ```

  A part that adds markup can't offer that form, which is a compile
  error, and it goes outermost. Don't show `.children()` on the builder
  in docs or examples.
- **The kit's attributes win** over the ones the consumer set on the
  builder it passes in. A part or view function writes every attribute
  it owns in every state, with `undefined` where the state leaves it
  absent: `disabled`, `aria-readonly`, the data attributes.
  `.attr(name, undefined)` and `.disabled(false)` remove the consumer's
  value, in a headless part too. That includes an attribute the kit
  never sets but mustn't leave to the consumer, such as `aria-disabled`
  on a part that uses the native `disabled`. Otherwise a consumer's
  `disabled` or `data-checked` reports a state the props don't have.
  - Token lists such as `class` and `aria-describedby` merge, and a part
    can't remove the consumer's tokens.
  - An attribute the kit never names keeps the consumer's value, so the
    ones it doesn't decide, such as `aria-label` or `popovertarget`,
    stay the consumer's.
  - When two kit calls share an element, the outer one writes last.
  - DOM properties set with `.prop` are the consumer's own doing, and
    the kit doesn't guard them.
- **Handlers.** A headless part's handlers sit on a layer of their own.
  Every layer's handler runs, the deepest component's first and the
  consumer's last, so a handler the consumer set on `element` runs after
  the part's. A view function has no layer: its handler is the
  consumer's handler for that event and would replace one already on
  `element`. So a view function throws at render when it was given an
  `on<Event>` and `element` already handles the event that option sets,
  as `Switch`'s root does for `click` with `onToggle`. Decide by the
  options and never by the state: a read-only switch sets no handler,
  but a clash that waited for it to become editable would first show in
  production. Without the option the function sets no handler, and the
  consumer's stays. That keeps a view function's behaviour from changing
  if it becomes a component.
  - With no handler on an element, the host gives the event to the
    nearest ancestor that handles it. So a click on a read-only control
    reaches the row around it. Don't promise that for a natively
    disabled one: the browser gives it no click.
- **Cancelling.** `on<Event>` and `onEmit` say what to send. They never
  cancel the native event, and the consumer gets no option to. The kit
  cancels only when the props rule the native action out, with
  `preventDefault: "always"` on the handler, as a disabled button that
  stays focusable does for its click. Sending a message cancels nothing:
  a `type: "reset"` button resets its form with or without `onPress`. A
  consumer who wants the press without the native action changes the
  props (`type: "button"`, `disabled`).
- **Markup the component needs to work**, such as a form field, must not be
  a part the consumer can forget to draw. The part it belongs to appends
  it after the consumer's `children`, as `Switch`'s root does with its
  hidden input. A headless part can't add children, so that part becomes
  a function in `parts` that applies the part and appends the markup. A
  part function has no `h`, so it builds the markup from Html's element
  classes, as `internal/field.ts` does with
  `View.toNode(new Html.VoidElement("input")...)`. Only put markup where
  the content model allows it: a hidden input may sit in a `<button>`, a
  checkbox may not.
- **A wrapped part drops its mount's requirements** (EFF-3914). A headless
  component's requirements come from the parts it returns, and a plain
  function around `p.part` hides them, so a consumer can forget to
  provide the service a part's `onMount` needs. If a part has such a
  mount, use the workaround in EFF-3914, and check the requirement in the
  component's typetest with `Component.Headless.Requirements`.
- The parts also carry plain values for markup that depends on state, in
  place of Base UI's `className(state)` functions: `s.checked`, `m.open`.

## Messages and events

- Name messages, events, Commands and mounts by the "Naming" section of
  `ai-docs/src/10_ui/index.md`, which `LLMS.md` includes. Base UI's
  callback names are never event names: Switch has `onToggle` and a
  Checkbox emits `Toggled`, not `CheckedChange`.
- `update` always uses `Message.match`, even for a union with one
  member, so a new message is a type error until it is handled.

## State

- The value is controlled. It comes in through props (`checked`, `value`,
  `open`), and the component reports the value the user asked for, in
  place of Base UI's `on<Value>Change`. There are no `default*` props:
  the consumer keeps the value in its Model.
- A component's Model holds only interaction state the consumer would
  never store: the active row, the typeahead buffer.
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
  document: a stream mount on the popover, applied only while the popup
  shows, reports Escape and mouse presses, as `Tooltip`'s `TrackDismissal`
  does. No service gives a Subscription the document, so it's a mount and
  not an entry in `subscriptions`. Which presses are outside is the
  component's call: `Tooltip` already tracks whether the pointer is on its
  parts, so its `update` decides, and a popup that doesn't track the
  pointer compares the press's target in the mount. The popup stays open
  until the consumer passes `open: false`, so a consumer can refuse.
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
- Attributes that come from a Field or Form context wait for those
  components.
- ARIA follows Base UI's source, not just its docs page. Prefer a native
  attribute (`disabled`) where Base UI's native mode uses one.

## Docs

The module JSDoc has, in order:

1. one sentence on what the component is, with the Base UI link, then
   which kind it is
2. **Anatomy**: a table of each Base UI part, its part name and element,
   then a line on what each part's options take and whether it has the
   stacking form
3. **Data attributes**
4. **Keyboard**
5. **Differences from Base UI**: everything left out or changed
6. one `**Example**` that runs as a doctest and checks the rendered HTML

The JSDoc of the view function or component lists the attributes and
events it owns. Each export has `@stability experimental`, `@category`
and `@since`.
