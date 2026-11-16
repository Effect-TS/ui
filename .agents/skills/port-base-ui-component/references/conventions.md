# ui-kit conventions

These are the rules a port follows. They were proposed with the first port,
`Switch`. Change them in a PR when a component needs something else, and
update the components that already follow them.

## Files and exports

- One module per component: `packages/ui-kit/src/<Name>.ts`, named as in
  Base UI (`Switch`, `ToggleGroup`). `pnpm codegen` adds it to the barrel,
  so consumers write `import { Switch } from "@effect/ui-kit"` or import
  `@effect/ui-kit/Switch`.
- Code shared by several components goes in `src/internal/<topic>.ts`.
- Tests go in `packages/ui-kit/test/<Name>.test.ts`.
- Import from module paths in `src` (`@effect/ui/Component`,
  `@effect/ui/html/Html`, `effect/Schema`); the lint rejects barrel imports
  there. Tests may use the barrels.
- A module exports:
  - the component, under the module's name: `Switch.Switch`
  - `Props`, the props Schema, and its `Props` type
  - `Events`, the events Schema, and its `Events` type
  - any row Schema the props take, such as `Option`
    The message Schema stays private.

## Headless component or pure view helper

- A **headless component** (`Component.define(...).make({ parts })`) is the
  default. Use it as soon as the component handles an event, owns
  interaction state, runs a Command (focus, scroll), or needs an id.
- A **pure view helper** is a function that takes the consumer's `h` and
  returns markup or decorated builders. Use it only when the component adds
  attributes and handles no event: Separator, Meter, Progress. A helper
  writes onto the consumer's own builder, where a later `.onClick` from the
  consumer replaces the helper's. Parts keep both handlers, the kit's first.

## Parts

- One part per Base UI part, in camelCase: `Switch.Root` is `root`,
  `Dialog.Popup` is `popup`.
- Each part accepts the native tag that gives the behaviour for free:
  `p.part("button", ...)` for anything pressable, so Space, Enter and
  focus come from the browser and need no key handler. List several tags
  only when Base UI supports them and the behaviour holds for each.
- A part sets ARIA, data attributes, ids, refs and handlers, and nothing
  visual. The consumer sets classes, styles, children and the accessible
  name.
- `parts` also returns plain values for markup that depends on state, in
  place of Base UI's `className(state)` functions: `s.checked`, `m.open`.

## State

- The value is controlled. It comes in through props (`checked`, `value`,
  `open`), and the component emits `<Value>Change` with the value the
  user asked for, as Base UI's `on<Value>Change`. There are no `default*`
  props: the consumer keeps the value in its Model.
- The Model holds only interaction state the consumer would never store:
  the active row, the typeahead buffer.
- `disabled` and `readOnly` are checked in `update`, so no message from
  a disabled control gets through even if an event fires.

## Data attributes and ARIA

- Base UI's names, on the parts Base UI puts them on.
- Present with an empty value, or absent: `.attr("data-checked", on ? "" : undefined)`.
- Attributes that come from a Field or Form context wait for those
  components.
- ARIA follows Base UI's source, not just its docs page. Prefer a native
  attribute (`disabled`) where Base UI's native mode uses one.

## Docs

The module JSDoc has, in order:

1. one sentence on what it is, and the Base UI link
2. **Anatomy**: a table of Base UI part, ui-kit part, element
3. **Data attributes**
4. **Keyboard**
5. **Differences from Base UI**: everything left out or changed
6. one `**Example**` that runs as a doctest

Each export has `@stability experimental`, `@category` and `@since`.
