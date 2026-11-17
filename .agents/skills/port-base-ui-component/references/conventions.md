# ui-kit conventions

A port follows these rules, and `Switch` is the first component built on
them. When a component needs something else, change the rule in a PR and
update the components that already follow it.

## Files and exports

- One module per component, `packages/ui-kit/src/<Name>.ts`, named as in
  Base UI (`Switch`, `ToggleGroup`).
- Consumers import the component by name and call it with their `h`:

  ```ts
  import { Switch } from "@effect/ui-kit"

  // In a view:
  Switch(h, {
    key: "notify",
    props: { checked: model.notify },
    onEmit: ({ checked }) => Message.make({ _tag: "ToggledNotify", checked }),
    view: (s) => h.label(s.root({ element: h.button, children: [s.thumb(h.span)] }), "Notify")
  })
  ```

  So `src/index.ts` is written by hand, not generated: `pnpm codegen`
  would export each module as a namespace, which can't be called. Add
  `export * from "./<Name>.ts"` to it in alphabetical order.
- Every export starts with the component's name, so the flat barrel never
  has two exports with one name: the component (`Switch`), `<Name>Props`
  and `<Name>Events` (each a Schema and its type), and any other type the
  API needs (`SwitchButton`, `ListboxOption`). The message Schema stays
  private.
- Code that several components share goes in `src/internal/<topic>.ts`,
  once a second component needs it.
- In `src`, import from module paths (`@effect/ui/Component`,
  `@effect/ui/html/Html`, `effect/Schema`), because the lint rejects barrel
  imports there. Tests may use the barrels.

## Kind of component

- A **headless component** (`Component.define(...).make({ parts })`) is
  the default. Use it as soon as the component handles an event, owns
  interaction state, runs a Command (focus, scroll) or needs an id. The
  consumer draws every element with its own builders, so it sets classes,
  any attribute, its own handlers and the accessible name, all typed by
  the builder.
- A **pure view helper** is a function that takes the consumer's `h` and
  returns decorated builders. Use it only when the component adds
  attributes and handles no event: Separator, Meter, Progress.
- A **component with slots** (`Component.define({ slots })`, finished with
  `view`) only fits when the kit must draw the structure itself and the
  consumer only supplies content. A definition can't have both `slots`
  and `parts`.

## Parts

- One part per Base UI part, in camelCase: `Switch.Thumb` is `thumb`,
  `Select.Popup` is `popup`.
- Each part accepts the native tag that gives the behaviour for free:
  `p.part("button", ...)` for anything pressable, so Space, Enter and focus
  come from the browser and need no key handler. List several tags only
  when Base UI supports them and the behaviour holds for each.
- A part sets ARIA, data attributes, ids, refs and handlers, and nothing
  visual. The consumer's handlers run after the part's.
- **The part's attributes win** over the ones the consumer set on the
  builder it passes in. A part writes its attributes over the consumer's,
  but an attribute it leaves absent keeps the consumer's value (EFF-3911).
  So the part function first clears, from the consumer's builder, every
  attribute it owns that some state leaves absent: `disabled`,
  `aria-disabled`, `aria-readonly`, the data attributes. Otherwise a
  consumer's `disabled` or `data-checked` reports a state the props
  don't have. Attributes the part doesn't decide, such as `aria-label`
  or `popovertarget`, stay the consumer's. What the consumer chains onto
  a part's result afterwards, and DOM properties set with `.prop`, are
  the consumer's own doing, and the kit doesn't guard them.
- **Markup the component needs to work**, such as a form field, must not be
  a part the consumer can forget to draw. A part can't add children, so
  the part it belongs to becomes a function in `parts` that applies the
  part and appends that markup. A part function has no `h`, so it builds
  that markup from Html's element classes, as Switch's field does with
  `View.toNode(new Html.VoidElement("input")...)`. Only put markup where
  the content model allows it: a hidden input may sit in a `<button>`, a
  checkbox may not.
- **Call shape.** A part that only decorates a builder takes it as its one
  argument: `s.thumb(h.span)`. A part that takes anything more takes one
  options object, so the call site names each argument:

  ```ts
  s.root({ element: h.button.class("switch"), children: [s.thumb(h.span)] })
  ```

  Use the same field names across components: `element` for the
  consumer's builder, `children` for what goes inside, and the Base UI
  name for anything else (`value`, `item`). Type `element` as the
  builders the part accepts, and keep the consumer's message type and the
  children's requirements inferred, as `Switch`'s `root` does.

  A part that takes `children` appends them, with any markup it adds, and
  returns the finished element (`s.root`). Any other part returns the
  chain, so the consumer can still add children: a Tabs tab takes
  `{ element, value }` and the consumer writes
  `s.tab({ element: h.button, value: "a" }).children("Account")`.

  `Listbox.ts` in `ai-docs` shows the core API, where extra arguments are
  positional (`m.option(h.li, option)`). ui-kit wraps `p.part` to take
  the options object.
- **A wrapped part drops its mount's requirements** (EFF-3914). A headless
  component's requirements come from the parts it returns, and a plain
  function around `p.part` hides them, so a consumer can forget to
  provide the service a part's `onMount` needs. If a part has such a
  mount, use the workaround in EFF-3914, and check the requirement in the
  component's typetest with `Component.Headless.Requirements`.
- `parts` also returns plain values for markup that depends on state, in
  place of Base UI's `className(state)` functions: `s.checked`, `m.open`.

## Messages and events

- Name messages and events as Foldkit does
  (https://foldkit.dev/core/messages): verb-first, past-tense facts about
  what happened, not instructions. Messages name their cause
  (`ClickedRoot`, `PressedKey`, `UpdatedQuery`). Events name what the
  user did (`Toggled`, `Picked`, `Dismissed`), not Base UI's callback
  names (`CheckedChange`, `OpenChange`).
- `update` always uses `Message.match`, even for a union with one
  member, so a new message is a type error until it is handled.

## State

- The value is controlled. It comes in through props (`checked`, `value`,
  `open`), and the component emits an event with the value the user asked
  for, in place of Base UI's `on<Value>Change`. There are no `default*`
  props: the consumer keeps the value in its Model.
- The Model holds only interaction state the consumer would never store:
  the active row, the typeahead buffer.
- `update` checks `disabled` and `readOnly`, so no message from a
  disabled control gets through, even if an event fires.

## Popups and the top layer

A React portal only moves where a popup renders. Choose the top-layer element
by who decides when the popup closes, not because the React source uses a
portal. The details are in the JSDoc of `popover` and `modal` in
`packages/ui/src/html/Html.ts`.

- `.popover("manual", open)` is controlled: the host shows and hides the
  popup as `open` says, and restores it if anything else changes it. Use
  it when `open` is a prop. Dismissal is then the kit's job: handle Escape
  on the focused part, and an outside click with `subscriptions` (stop if
  none fits), each emitting `Dismissed`. The popup stays open until the
  consumer passes `open: false`, so a consumer can refuse.
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

1. one sentence on what the component is, with the Base UI link
2. **Anatomy**: a table of each Base UI part, its part name and element,
   then a line on each part function that takes an options object
3. **Data attributes**
4. **Keyboard**
5. **Differences from Base UI**: everything left out or changed
6. one `**Example**` that runs as a doctest and checks the rendered HTML

The component's own JSDoc lists the attributes its parts own. Each export
has `@stability experimental`, `@category` and `@since`.
