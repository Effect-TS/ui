/**
 * React Native controls and APIs beyond the core vocabulary.
 *
 * Components are exported by name (`import { Switch } from "@effect/ui-native/kit"`,
 * called as `Switch(h, { ... })`) and re-exported from their own subpath
 * (`@effect/ui-native/kit/Switch`). Non-component modules are exported as
 * namespaces (e.g. `Keyboard.dismiss`).
 *
 * @stability experimental
 * @since 0.1.0
 */

// Hand-written barrel: `pnpm codegen` exports modules as namespaces, which
// aren't callable. Add components with `export *` and non-component modules
// with `export * as`, in alphabetical order.

export * as Css from "./Css.ts"
