/* oxlint-disable unicorn/no-empty-file -- empty until the first module lands */
/**
 * React Native's controls and APIs beyond the core vocabulary, each on its
 * own native view or module.
 *
 * Each component is exported by its own name, so
 * `import { Switch } from "@effect/ui-native/kit"` is the component itself,
 * called as `Switch(h, { ... })`. Its module, such as
 * `@effect/ui-native/kit/Switch`, holds the same exports.
 *
 * A module that isn't a component, such as `Keyboard`, is exported as a
 * namespace: `Keyboard.dismiss`.
 *
 * @stability experimental
 * @since 0.1.0
 */

// Not a generated barrel: `pnpm codegen` would export each module as a
// namespace, and a namespace can't be called. Add each new module here with
// `export *`, or `export * as` for a module that isn't a component, in
// alphabetical order.
