---
name: port-base-ui-component
description: Port one Base UI component into packages/ui-kit as an unstyled Effect UI view function or component. Use when asked to add a ui-kit component that Base UI has, such as Switch, Toggle, Tabs or Dialog.
---

# Port a Base UI component into ui-kit

One run ports one component. If the port needs another ui-kit
component that doesn't exist yet, such as a Field, a Popover or a positioning
helper, stop and open a separate issue for it. When the missing piece only
backs an optional feature, leave the feature out, list it under "Differences
from Base UI" in the module docs, and carry on.

Read [references/conventions.md](references/conventions.md) before step 3.
`Switch` (`packages/ui-kit/src/Switch.ts` and its test) is the worked
example of a view function. For a headless component, the "Headless
components" section of `LLMS.md` and
`ai-docs/src/10_ui/fixtures/kit/Listbox.ts` show the core API, and the
conventions say where ui-kit wraps it.

## Checklist

Work top to bottom. Put the notes from steps 1 to 3 in the PR description.

1. **Read Base UI.** Fetch `https://base-ui.com/react/components/<name>.md`
   (the `.md` page has the full API tables) and the source under
   `packages/react/src/<name>/` in https://github.com/mui/base-ui. Note:
   - the parts (anatomy) and the element each one renders
   - the props, and which are controlled, `default*` or React-only
     (`className`, `style`, `render`, refs)
   - the state, and the data attributes on each part
   - the keyboard interaction, and whether a native element gives it
     (`useButton` with `native`) or a key handler does
   - the ARIA roles and attributes, and which element carries each
   - the contexts it reads (`Field`, `Form`, `Direction`): each is a
     dependency for the scope rule above
2. **Read Foldkit.** Look for `packages/ui/src/<name>/` on the
   `codex/layers-and-submodels` branch of https://github.com/foldkit/foldkit.
   If it exists, note where it differs from Base UI and why. It is the
   closest reference for the same ideas without React.
3. **Decide the shape**, using the conventions:
   - view function, headless component, or (rarely) a component with
     slots. Count the state Base UI keeps that the port puts off
   - one element with `element` and `children`, or several arranged in
     `view`
   - the parts, the tag each accepts, and the attributes and events each
     owns
   - each part's options, and which parts add markup and so have no
     stacking form
   - the props, and the events: `on<Event>` options for a view function,
     `<Name>Events` for a component
   - for a component, the Model, which holds only interaction state the
     consumer never stores
   - the message and event names, as past-tense facts
   - the Base UI features you leave out, and why
4. **Implement** `packages/ui-kit/src/<Name>.ts`, unstyled, and add
   `export * from "./<Name>.ts"` to `packages/ui-kit/src/index.ts`.
5. **Test** in `packages/ui-kit/test/<Name>.test.ts`. Test a view function
   with `Scene.make` and a small consumer component that calls it, and
   call it directly with a `View.makeHelper` helper for its attributes and
   markup. Test a headless component with `Story.make` and a stand-in
   view, or `Story.parts` for a part on its own. Cover, in as few tests as
   you can:
   - each interaction sends the right message or emits the right event,
     and a disabled or read-only component reports nothing
   - the ARIA and data attributes for each state, on every part that has them
   - the keyboard: fire `keydown` for the keys the component handles. For
     keys a native element handles, assert that a part rejects another tag
   - the markup a part function adds, such as the form field
   - precedence: on each part, a consumer value for every attribute the part
     owns loses, both when the part sets it and when the state leaves it
     absent, while the consumer's class and other attributes stay
   - for a view function, an `element` that already handles an event
     fails the render when the `on<Event>` option would replace it, in
     every state, and keeps its handler without the option

   Add `packages/ui-kit/typetest/<Name>.tst.ts` for each part function: the
   return type of the options form and of the stacking form, the inferred
   message type and requirements, and the tags it rejects. Then break the
   code (for example, drop the disabled guard, or
   the `undefined` a part writes for an absent state) and check that a test
   fails.
6. **Document and check.**
   - Write the module JSDoc in the shape the conventions give. The one
     example goes in a fence opened with `ts import.meta.vitest`, so it runs
     as a doctest. Examples aren't type-checked, so the example renders the
     component with `HtmlServer.renderToHtml` and throws unless the HTML
     shows one thing, such as the consumer's class next to the part's role.
   - Add `@since`, `@category` and `@stability experimental` to every export.
   - Add the component to `packages/ui-kit/README.md`.
   - Add a changeset: `"@effect/ui-kit": minor`.
   - Run each of these with `nix develop -c`: `pnpm lint`, `pnpm check`,
     `pnpm vitest run --project @effect/ui-kit`,
     `pnpm test-types packages/ui-kit/typetest`,
     `pnpm doctest run packages/ui-kit/src/<Name>.ts`, `pnpm jsdocs --check`,
     `pnpm circular` and `pnpm ai-docgen`, which should leave `LLMS.md`
     unchanged.
