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

Read [references/conventions.md](references/conventions.md) before step 3, and
[references/react-mapping.md](references/react-mapping.md) before step 4.
`Switch` (`packages/ui-kit/src/Switch.ts`) is the worked example. The
headless component guide in `LLMS.md` and
`ai-docs/src/10_ui/fixtures/kit/Listbox.ts` show the API it builds on.

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
   - headless component or pure view helper
   - the parts, named after Base UI's, and the native tag each one accepts
   - the props (the controlled value and the options), the events, and the
     Model, which holds only interaction state the consumer never stores
   - which Base UI features you leave out, and why
4. **Map React to Effect UI.** Translate each hook, context, ref, render prop
   and portal with the mapping table. A row marked "stop" is the scope rule.
5. **Implement** `packages/ui-kit/src/<Name>.ts`, unstyled, following the
   conventions. Run `nix develop -c pnpm codegen` to update the barrel.
6. **Test** in `packages/ui-kit/test/<Name>.test.ts`, with as few tests as
   cover the behaviour:
   - each interaction emits the right event, and a disabled or read-only one
     emits nothing
   - the ARIA and data attributes for each state, on every part that has them
   - the keyboard: fire `keydown` for the keys the component handles. For
     keys a native element handles, assert that the part rejects other tags.
     Use `Story.make` with a stand-in view and `Story.parts`. Break the code
     once (for example, drop the disabled guard) and check that a test fails.
7. **Document and check.**
   - module JSDoc in the shape the conventions give, with one example
     in a fence opened with `ts import.meta.vitest` so it runs as a doctest, and `@since`,
     `@category` and `@stability experimental` on every export
   - add the component to `packages/ui-kit/README.md`
   - a changeset: `"@effect/ui-kit": minor`
   - run, each prefixed with `nix develop -c`: `pnpm codegen`,
     `pnpm lint`, `pnpm check`, `pnpm vitest run --project @effect/ui-kit`,
     `pnpm doctest run packages/ui-kit/src/<Name>.ts`, `pnpm jsdocs --check`
     and `pnpm circular`
8. **Update this skill.** If a step was unclear, or the port needed a
   convention that isn't written down, fix this file or the conventions in
   the same PR and say so in the PR description.
