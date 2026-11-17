---
name: port-base-ui-component
description: Port one Base UI component or view helper into packages/ui-kit as an unstyled Effect UI component. Use when asked to add a ui-kit component that Base UI has, such as Switch, Toggle, Tabs or Dialog.
---

# Port a Base UI component into ui-kit

One run ports one component or view helper. If the port needs another ui-kit
component that doesn't exist yet, such as a Field, a Popover or a positioning
helper, stop and open a separate issue for it. When the missing piece only
backs an optional feature, leave the feature out, list it under "Differences
from Base UI" in the module docs, and carry on.

Read [references/conventions.md](references/conventions.md) before step 3.
`Switch` (`packages/ui-kit/src/Switch.ts`) is the worked example. The
"Slots" and "Headless components" sections of `LLMS.md`, with
`ai-docs/src/10_ui/fixtures/kit/Collapsible.ts` and
`ai-docs/src/10_ui/fixtures/kit/Listbox.ts`, show the API it builds on.

## Checklist

Work top to bottom. Write the notes from steps 1 to 3 into the PR description.

1. **Read Base UI.** Fetch `https://base-ui.com/react/components/<name>.md`
   (the `.md` URL has the full API tables) and the source under
   `packages/react/src/<name>/` in https://github.com/mui/base-ui. Note:
   - the parts (anatomy) and the element each one renders
   - the props, and which are controlled, `default*` or React-only
     (`className`, `style`, `render`, refs)
   - the state and the data attributes on each part
   - the keyboard interaction, and whether it comes from a native element
     (`useButton` with `native`) or a key handler
   - the ARIA roles and attributes, and which element carries them
   - the contexts it reads (`Field`, `Form`, `Direction`): each is a
     dependency for the scope rule above
2. **Read Foldkit.** Look for `packages/ui/src/<name>/` on the
   `codex/layers-and-submodels` branch of https://github.com/foldkit/foldkit.
   If it exists, note where it diverges from Base UI and why. It is the
   closest reference for the same ideas without React.
3. **Decide the shape.** Using the conventions:
   - component with slots, headless component, or pure view helper
   - the element for each Base UI part, and the slots the consumer fills,
     or, for a headless component, the parts and the tags each accepts
   - the props (the controlled value, the options and `attributes`), the events, and the
     Model, which holds only interaction state the consumer never stores
   - the message and event names, as past-tense facts
   - which Base UI features you leave out, and why
4. **Implement** `packages/ui-kit/src/<Name>.ts`, unstyled, following the
   conventions, and add `export * from "./<Name>.ts"` to
   `packages/ui-kit/src/index.ts`.
5. **Test** in `packages/ui-kit/test/<Name>.test.ts`, with as few tests as
   cover the behaviour:
   - each interaction emits the right event, and a disabled or read-only one
     emits nothing
   - the ARIA and data attributes for each state, on every part that has them
   - the keyboard: fire `keydown` for the keys the component handles. For
     keys a native element handles, assert the element's tag
   - the markup the component draws for itself, such as the form field, and
     where each slot's content shows
   - the `data-scope` and `data-part` on every styled element
   - `attributes`: a class on every styled element, an arbitrary attribute
     such as `aria-label`, and that consumer values for every owned
     attribute and an `onclick` don't get through, while the component's
     handler still fires. Pass the owned names in another case too, and
     check them in server HTML and on a client mount
     (`test/html/<Name>.test.ts`, under happy-dom)
   - Select elements by `data-part` in tests, as consumers do.
   - Use `Story.make(C, props, { slots: (h) => ({ ... }) }, f)` for a
     component with slots, and a stand-in view with `Story.parts` for a
     headless one. Break the code once (for example, drop the disabled
     guard) and check that a test fails.
6. **Document and check.**
   - module JSDoc in the shape the conventions give, with one example
     in a fence opened with `ts import.meta.vitest` so it runs as a doctest.
     The example renders the component and checks one thing it shows, as
     examples aren't type-checked. Add `@since`,
     `@category` and `@stability experimental` on every export
   - add the component to `packages/ui-kit/README.md`
   - a changeset: `"@effect/ui-kit": minor`
   - run, each prefixed with `nix develop -c`: `pnpm lint`, `pnpm check`, `pnpm vitest run --project @effect/ui-kit`,
     `pnpm doctest run packages/ui-kit/src/<Name>.ts`, `pnpm jsdocs --check`,
     `pnpm circular` and `pnpm ai-docgen` (it should leave `LLMS.md`
     unchanged)
