# ui-kit conventions

These are the rules a port follows. They were proposed with the first port,
`Switch`. Change them in a PR when a component needs something else, and
update the components that already follow them.

## Files and exports

- One module per component: `packages/ui-kit/src/<Name>.ts`, named as in
  Base UI (`Switch`, `ToggleGroup`).
- Consumers import the component by name and call it:

  ```ts
  import { Switch } from "@effect/ui-kit"

  // In a view:
  Switch(h, { key: "notify", props: { checked: model.notify }, slots: { label: "Notify" } })
  ```

  So `src/index.ts` is not a generated barrel: `pnpm codegen` would export
  each module as a namespace, which can't be called. Add
  `export * from "./<Name>.ts"` to it by hand, in alphabetical order.
- Everything a module exports starts with the component's name, so the
  flat barrel never has two exports with one name:
  - the component: `Switch`
  - `<Name>Props`, the props Schema, and its type
  - `<Name>Events`, the events Schema, and its type
  - any other Schema or type the API needs, such as `ListboxOption`
    The message Schema stays private.
- Code shared by several components goes in `src/internal/<topic>.ts`.
- Tests go in `packages/ui-kit/test/<Name>.test.ts`.
- Import from module paths in `src` (`@effect/ui/Component`,
  `@effect/ui/html/Html`, `effect/Schema`); the lint rejects barrel imports
  there. Tests may use the barrels.

## Kind of component

- A **component with a view and slots** (`Component.define({ slots })`,
  finished with `view`) is the default. Use it as soon as the component
  handles an event, owns interaction state, runs a Command (focus, scroll),
  needs an id, or needs markup to work, such as a form field. The kit draws
  every element, and the consumer passes what goes inside in named slots.
- A **headless component** (`Component.define(...).make({ parts })`) is
  for structure that named slots can't carry: the consumer draws a list of
  its own rows or items (Listbox options, Tabs), or must choose the
  elements. A definition can't have both `slots` and `parts`.
- A **pure view helper** is a function that takes the consumer's `h` and
  returns markup or decorated builders. Use it only when the component adds
  attributes and handles no event: Separator, Meter, Progress. A helper
  writes onto the consumer's own builder, where a later `.onClick` from the
  consumer replaces the helper's.

## Markup and slots

- One element per Base UI part, with the native tag that gives the
  behaviour for free: a `<button type="button">` for anything pressable,
  so Space, Enter and focus come from the browser and need no key handler.
- The view sets ARIA, data attributes, ids, refs and handlers, and nothing
  visual: no classes and no styles.
- Every element the consumer may style gets `data-scope="<name>"`, the
  component's name in kebab-case, and `data-part="<part>"`, the Base UI
  part in kebab-case (`root`, `thumb`), or a name for an element Base UI
  doesn't have (`label`). These and the state attributes are the styling
  contract, so the tags and nesting can change: consumers select
  `[data-scope="switch"][data-part="thumb"]` inside a class of their own
  around the component. The scope keeps a part of one component from
  matching a part of another nested in it. Hidden elements, such as a form
  field, get neither.
- Markup the component needs to work, such as a form field or the
  `<label>` that names a control, is drawn by the view, so a consumer
  can't forget it. Only put an element where its content model allows it.
- Name a slot after what the consumer passes, not after a Base UI part:
  `label`, `title`, `description`. Place each slot once per render. A
  slot the consumer leaves out shows nothing, so the component must work
  without it, apart from losing what it carries.
- A slot is optional, so when it carries a control's accessible name the
  control also takes `aria-label` and `aria-labelledby` props, plus
  `aria-describedby` and `id`, set on the control as given. A switch
  named by a table header, or an icon-only one, has no slot text.
- A slot's content belongs to the consumer: its handlers send the
  consumer's messages. Use a slot for content, and props for anything the
  component reads.

## Headless parts

When a component is headless:

- One part per Base UI part, in camelCase: `Tabs.Tab` is `tab`,
  `Select.Popup` is `popup`. Each accepts the native tag that gives the
  behaviour for free, `p.part("button", ...)`, and lists several tags only
  when Base UI supports them and the behaviour holds for each.
- Parts keep the consumer's handlers as well as the kit's, the kit's
  first. The consumer sets classes, styles, children and the accessible
  name.
- Markup the component needs to work must not be a part the consumer can
  forget to draw. A part can't add children, so the part it belongs to
  becomes a function in `parts` that applies the part and appends that
  markup, `s.root(h.button, ...children)`.
- `parts` also returns plain values for markup that depends on state, in
  place of Base UI's `className(state)` functions: `m.open`.

## Messages and events

- Name messages and events as Foldkit does
  (https://foldkit.dev/core/messages): verb-first, past-tense facts about
  what happened, not instructions. Messages name their cause
  (`ClickedRoot`, `PressedKey`, `UpdatedQuery`). Events name what the
  user did (`Toggled`, `Picked`, `Dismissed`), not Base UI's callback
  names (`CheckedChange`, `OpenChange`).
- `update` always uses `Message.match`, even when the union has one
  member, so adding a message is a type error until it is handled.

## State

- The value is controlled. It comes in through props (`checked`, `value`,
  `open`), and the component emits an event with the value the user asked
  for, in place of Base UI's `on<Value>Change`. There are no `default*`
  props: the consumer keeps the value in its Model.
- The Model holds only interaction state the consumer would never store:
  the active row, the typeahead buffer.
- `disabled` and `readOnly` are checked in `update`, so no message from
  a disabled control gets through even if an event fires.

## Popups and the top layer

A React portal only moves where a popup renders. Choose the top-layer element
by who decides when it closes, not because the React source uses a portal.
The details are in the JSDoc of `popover` and `modal` in
`packages/ui/src/html/Html.ts`.

- `.popover("manual", open)` is controlled: the host shows and hides it as
  `open` says, and puts it back if anything else changes it. Use it when
  `open` is a prop. Dismissal is then the kit's job: handle Escape on the
  focused part, and an outside click with `subscriptions` (stop if none
  fits), each emitting `Dismissed`. The popup stays open until the consumer
  passes `open: false`, so a consumer can refuse.
- `.popover("auto", open)` with `onToggle` is followed: the browser closes
  it on Escape, an outside click or another auto popover opening, and the
  Model must store what `onToggle` reports. Use it only when `open` is the
  component's own Model state and nobody can refuse a close, as in
  `Listbox`. Never use it for an `open` prop: the browser closes the popup
  while the props still say open.
- `<dialog>` with `.modal(open)` and `onCancel` is a controlled modal: the
  host cancels Escape and backdrop clicks and sends them as `onCancel`,
  which emits `Dismissed`. Browsers may still force a close after repeated
  cancels, so handle `onClose` too and emit `Dismissed` from it.

## Data attributes and ARIA

- Base UI's names, on the parts Base UI puts them on, and on any styled
  element the kit adds around them, such as Switch's `<label>`.
- Present with an empty value, or absent: `.attr("data-checked", on ? "" : undefined)`.
- Attributes that come from a Field or Form context wait for those
  components.
- ARIA follows Base UI's source, not just its docs page. Prefer a native
  attribute (`disabled`) where Base UI's native mode uses one.
- A prop that sets an HTML attribute as given keeps the attribute's name:
  `"aria-label"`, `id`.

## Docs

The module JSDoc has, in order:

1. one sentence on what it is, and the Base UI link
2. **Anatomy**: a table of Base UI part and element, with the slots
   where the view places them, or the part names for a headless component
3. **Styling**: the `data-scope` and `data-part` of each element
4. **Data attributes**
5. **Keyboard**
6. **Differences from Base UI**: everything left out or changed
7. one `**Example**` that runs as a doctest

Each export has `@stability experimental`, `@category` and `@since`.
